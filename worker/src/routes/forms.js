// @ts-check
/**
 * POST /api/contact        demandes (contact, devis, salle, « être prévenu », question de l'assistant)
 * POST /api/registrations  réservations (session) ou demandes d'inscription (date à convenir, particulier sans paiement)
 *
 * Ordre : taille du corps → robots → validation → Turnstile → limite de débit → feuille (signée) → e-mail (EmailJS).
 * La ligne est TOUJOURS écrite dans la feuille avant l'e-mail. Si la feuille ne répond pas : boîte de secours Supabase
 * (rejouée par la tâche planifiée) + e-mail direct à l'équipe, référence CFW-…
 * « ok: true » n'est renvoyé que si la demande est réellement enregistrée (feuille ou boîte de secours).
 * Sans JavaScript (formulaire HTML classique), la réponse est une page de confirmation ou d'erreur dans la bonne langue.
 */
import { fail, htmlPage, json, readBody, reference } from "../lib/http.js";
import { callSheet } from "../lib/sheets.js";
import { validateContact, validateRegistration } from "../lib/validate.js";
import { ipHash, mollie, mollieConfigured, mollieValue, rateLimit, sendEmail, supabase, supabaseConfigured, verifyTurnstile } from "../lib/services.js";
import { t, teamRequestEmail } from "../lib/emails.js";
import { userFromRequest } from "../lib/auth.js";
import ROUTES from "../generated/routes.json" with { type: "json" };

const MIN_FILL_MS = 2500;

/** Code d'erreur → texte d'interface traduit. */
const MESSAGES = { INVALID: "form.fix_errors", RATE_LIMITED: "form.rate_limited", CAPTCHA: "form.captcha_error", BUSY: "reg.busy",
  FULL: "reg.full", NOT_ENOUGH: "reg.unavailable", CLOSED: "reg.closed", NOT_FOUND: "reg.session_unavailable", PAYMENT: "reg.payment_unavailable",
  UNAVAILABLE: "form.error_text", ERROR: "form.error_text" };

export function message(lang, code, vars = {}) {
  return t(lang, MESSAGES[code] || "form.error_text", vars);
}

function siteUrl(env) {
  return String(env.SITE_URL || "https://centrecfs.be").replace(/\/$/, "");
}

/** Réponse JSON, ou page HTML si le formulaire a été envoyé sans JavaScript. */
function answer(form, lang, payload, status, back) {
  if (!form) return json(payload, status);
  const ok = payload.ok === true;
  return htmlPage({
    lang, status: ok ? 200 : status,
    title: ok ? t(lang, "form.sent_title") : t(lang, "form.error_title"),
    text: ok ? t(lang, "form.sent_text", { ref: payload.reference }) : payload.message,
    back: back || ROUTES.pages.contact[lang] || "/contact/", backLabel: t(lang, "nav.home_crumb"),
  });
}

async function guard(request, env, data, lang) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const token = data.turnstileToken || data["cf-turnstile-response"] || "";
  if (!(await verifyTurnstile(env, token, ip))) return { code: "CAPTCHA", status: 403 };
  const key = "f:" + (await ipHash(env, ip));
  if (!(await rateLimit(env, key, 20, 3600))) return { code: "RATE_LIMITED", status: 429 };
  return null;
}

/**
 * Feuille injoignable : boîte de secours (Supabase) + e-mail direct à l'équipe. Référence CFW-…
 * @returns {Promise<string | null>} la référence, ou null si rien n'a pu être enregistré
 */
async function fallback(env, kind, req) {
  const ref = reference("CFW");
  let saved = false;
  if (supabaseConfigured(env)) {
    const r = await supabase(env, "/rest/v1/outbox_requests", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ request_id: req.requestId, kind, reference: ref, payload: req }),
    });
    saved = r.ok;
  }
  const mail = teamRequestEmail(siteUrl(env), { ...req, message: `[Secours : feuille injoignable, demande à rejouer]\n\n${req.message || ""}` }, ref);
  const sent = await sendEmail(env, { template: "equipe", replyTo: req.email, ...mail });
  return saved || sent.ok ? ref : null;
}

/* ------------------------------------------------------------------ contact */

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 */
export async function postContact(request, env) {
  const body = await readBody(request);
  if (!body.data) return fail("INVALID", message("fr", "INVALID"), 400);
  const data = body.data;
  const lang = ["fr", "nl", "en"].includes(data.lang) ? data.lang : "fr";
  if (body.form && !data.requestId) data.requestId = crypto.randomUUID();
  if (body.form) data.consent = data.consent === "1" || data.consent === "on";
  const back = request.headers.get("Referer") || "";
  // Robots : champ piège rempli ou envoi trop rapide → réponse normale, rien n'est enregistré
  const elapsed = Number(data.elapsedMs ?? data.elapsed);
  if (data.website || (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS)) {
    return answer(body.form, lang, { ok: true, reference: reference("CFD") }, 200, back);
  }
  const { value: req, fields } = validateContact(data);
  if (Object.keys(fields).length) return answer(body.form, lang, { ok: false, code: "INVALID", message: message(lang, "INVALID"), fields }, 400, back);
  const blocked = await guard(request, env, data, lang);
  if (blocked) return answer(body.form, lang, { ok: false, code: blocked.code, message: message(lang, blocked.code) }, blocked.status, back);

  const res = await callSheet(env, { action: "contact", ...req, website: "", elapsed: Number.isFinite(elapsed) ? elapsed : 99999, consent: true, reserveEmail: true });
  if (res.status === "ok") {
    if (!res.ignored && !res.spam && res.email && res.email.allowed) {
      const mail = teamRequestEmail(siteUrl(env), req, res.reference, res.trainingName);
      const sent = await sendEmail(env, { template: "equipe", replyTo: req.email, ...mail });
      if (!sent.ok) {
        // La demande est en sécurité dans la feuille : l'e-mail est confié à sa file d'envoi (réessais automatiques)
        await callSheet(env, { action: "enqueueEmail", email: { kind: "Demande", priority: "P2", template: "equipe", replyTo: req.email, ref: res.reference, lang: "fr", ...mail } });
      }
    }
    return answer(body.form, lang, { ok: true, reference: res.reference }, 200, back);
  }
  if (res.status === "invalid") return answer(body.form, lang, { ok: false, code: "INVALID", message: message(lang, "INVALID"), fields: res.fields || {} }, 400, back);
  if (res.status === "rate_limited") return answer(body.form, lang, { ok: false, code: "RATE_LIMITED", message: message(lang, "RATE_LIMITED") }, 429, back);
  if (res.status === "busy") return answer(body.form, lang, { ok: false, code: "BUSY", message: message(lang, "BUSY") }, 503, back);
  const ref = await fallback(env, "contact", req);
  if (ref) return answer(body.form, lang, { ok: true, reference: ref, fallback: true }, 200, back);
  return answer(body.form, lang, { ok: false, code: "UNAVAILABLE", message: message(lang, "UNAVAILABLE") }, 503, back);
}

/* ------------------------------------------------------------------ réservations */

/** Demande d'inscription (onglet Demandes) quand aucune place ne peut être bloquée. */
function asRequest(v) {
  const names = v.participants.map((p) => `${p.firstName} ${p.lastName}`.trim() + (p.email ? ` (${p.email})` : "")).join(", ");
  const details = [["Participants", names], ["Places", String(v.participants.length)], ["Facturation", v.billing.type === "company" ? "Entreprise" : "Particulier"],
    ["TVA", v.billing.vat], ["Adresse", [v.billing.street, `${v.billing.zip} ${v.billing.city}`.trim(), v.billing.country].filter(Boolean).join(", ")],
    ["Langue de la formation", v.trainingLanguage]].filter(([, x]) => x).map(([a, b]) => [a, String(b).slice(0, 400)]);
  return {
    requestId: v.requestId, form: "inscription", lang: v.lang, name: `${v.customer.firstName} ${v.customer.lastName}`.trim(), email: v.customer.email,
    phone: v.customer.phone, company: v.billing.company, message: v.notes, training: v.training, sessionId: v.sessionId || "", page: "", consent: true, details,
  };
}

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 */
export async function postRegistration(request, env) {
  const body = await readBody(request);
  if (!body.data) return fail("INVALID", message("fr", "INVALID"), 400);
  const data = body.data;
  const lang = ["fr", "nl", "en"].includes(data.lang || data.locale) ? (data.lang || data.locale) : "fr";
  const elapsed = Number(data.elapsedMs);
  if (data.website || (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS)) return json({ ok: true, reference: reference("CFS"), status: "request" });
  const { value: v, fields } = validateRegistration(data);
  if (Object.keys(fields).length) return fail("INVALID", message(lang, "INVALID"), 400, { fields });
  const blocked = await guard(request, env, data, lang);
  if (blocked) return fail(blocked.code, message(lang, blocked.code), blocked.status);

  const user = await userFromRequest(request, env);
  const company = v.billing.type === "company" && Boolean(v.billing.vat);
  const online = v.payMode === "online" && env.ONLINE_PAYMENT_ENABLED === "1" && mollieConfigured(env);
  // Aucune place ne peut être bloquée : pas de session choisie, ou particulier sans paiement en ligne → demande
  if (!v.sessionId || (!company && !online)) {
    const req = asRequest(v);
    const res = await callSheet(env, { action: "contact", ...req, elapsed: 99999, reserveEmail: true });
    if (res.status === "ok") {
      if (res.email && res.email.allowed) {
        const mail = teamRequestEmail(siteUrl(env), req, res.reference, res.trainingName);
        const sent = await sendEmail(env, { template: "equipe", replyTo: req.email, ...mail });
        if (!sent.ok) await callSheet(env, { action: "enqueueEmail", email: { kind: "Demande", priority: "P2", template: "equipe", replyTo: req.email, ref: res.reference, lang: "fr", ...mail } });
      }
      return json({ ok: true, reference: res.reference, status: "request" });
    }
    if (res.status === "unreachable") {
      const ref = await fallback(env, "registration", req);
      return ref ? json({ ok: true, reference: ref, status: "request", fallback: true }) : fail("UNAVAILABLE", message(lang, "UNAVAILABLE"), 503);
    }
    return fail(res.status === "rate_limited" ? "RATE_LIMITED" : res.status === "busy" ? "BUSY" : "INVALID", message(lang, res.status === "rate_limited" ? "RATE_LIMITED" : res.status === "busy" ? "BUSY" : "INVALID"), res.status === "rate_limited" ? 429 : res.status === "busy" ? 503 : 400, { fields: res.fields || {} });
  }

  const order = {
    action: "book", requestId: v.requestId, userId: user ? user.id : "", lang: v.lang, payMode: online ? "online" : "invoice",
    vatRate: Number(env.VAT_RATE || 0.21), customer: v.customer, billing: v.billing, notes: v.notes,
    items: [{ training: v.training, sessionId: v.sessionId, quantity: v.participants.length, participants: v.participants }],
  };
  const res = await callSheet(env, order);
  if (res.status === "unavailable") {
    const p = (res.problems || [])[0] || {};
    const code = p.reason === "full" ? "FULL" : p.reason === "insufficient" ? "NOT_ENOUGH" : p.reason === "closed" ? "CLOSED" : "NOT_FOUND";
    return fail(code, message(lang, code, { remaining: p.remaining ?? 0 }), 409, { remaining: p.remaining ?? 0 });
  }
  if (res.status === "invalid") return fail("INVALID", message(lang, "INVALID"), 400, { fields: res.fields || {} });
  if (res.status === "rate_limited") return fail("RATE_LIMITED", message(lang, "RATE_LIMITED"), 429);
  if (res.status === "busy") return fail("BUSY", message(lang, "BUSY"), 503);
  if (res.status !== "ok") {
    const ref = await fallback(env, "registration", asRequest(v));
    return ref ? json({ ok: true, reference: ref, status: "request", fallback: true }) : fail("UNAVAILABLE", message(lang, "UNAVAILABLE"), 503);
  }
  const out = { ok: true, reference: res.reference, status: online ? "pending_payment" : "pending_invoice", expiresAt: res.expiresAt || null, amounts: res.amounts || null };
  if (!online || res.duplicate) return json(out);
  // Paiement en ligne : montant calculé par la feuille (jamais par le navigateur)
  const cents = res.amounts && res.amounts.inclCents;
  if (!(cents > 0)) return fail("PAYMENT", message(lang, "PAYMENT"), 502);
  const site = siteUrl(env);
  const pay = await mollie(env, "POST", "/payments", {
    amount: { currency: "EUR", value: mollieValue(cents) },
    description: `Centre CFS : ${v.training}, ${res.reference}`.slice(0, 255),
    redirectUrl: `${site}${ROUTES.pages.paiement[lang]}?ref=${encodeURIComponent(res.reference)}`,
    webhookUrl: `${site}/api/payments/mollie-webhook`,
    locale: lang === "nl" ? "nl_BE" : lang === "en" ? "en_US" : "fr_BE",
    metadata: { reference: res.reference },
  });
  const checkout = pay.data && pay.data._links && pay.data._links.checkout && pay.data._links.checkout.href;
  if (!pay.ok || !checkout) {
    await callSheet(env, { action: "cancel", ref: res.reference, reason: "payment_unavailable" });
    return fail("PAYMENT", message(lang, "PAYMENT"), 502);
  }
  await callSheet(env, { action: "attachPayment", ref: res.reference, mollieId: pay.data.id });
  return json({ ...out, paymentUrl: checkout });
}
