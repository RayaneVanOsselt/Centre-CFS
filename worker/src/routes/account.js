// @ts-check
/**
 * Paiement, espace client et hook d'e-mails Supabase.
 *
 * POST /api/payments/mollie-webhook   Mollie n'envoie qu'un identifiant : le paiement est TOUJOURS relu auprès de Mollie
 * GET  /api/payments/status?ref=…     état d'une réservation pour la page de retour (aucune donnée personnelle)
 * GET  /api/account/reservations      réservations du compte connecté (jeton Supabase vérifié)
 * GET  /api/account/export            export des données du compte (profil + réservations), JSON
 * POST /api/account/delete            suppression du compte (adresse e-mail à confirmer) ; réservations anonymisées
 * POST /api/hooks/supabase-email      e-mails d'authentification (signature Standard Webhooks), envoyés via EmailJS
 */
import { fail, json } from "../lib/http.js";
import { callSheet } from "../lib/sheets.js";
import { mollie, sendEmail, supabase } from "../lib/services.js";
import { userFromRequest, verifyWebhook } from "../lib/auth.js";
import { authEmail, t } from "../lib/emails.js";

const REF_RE = /^CF[SDW]-\d{4}-[A-Z2-9]{5,6}$/;

/* ------------------------------------------------------------------ paiement */

export async function mollieWebhook(request, env) {
  const text = await request.text();
  const id = new URLSearchParams(text).get("id") || "";
  if (!/^tr_[A-Za-z0-9]{6,40}$/.test(id)) return new Response("ok");      // ne rien révéler à un appel inconnu
  const pay = await mollie(env, "GET", `/payments/${id}`);
  const p = pay.data || {};
  const ref = p.metadata && p.metadata.reference;
  if (!pay.ok || !REF_RE.test(String(ref || ""))) return new Response("ok");
  const cents = Math.round(Number(p.amount && p.amount.value) * 100);
  if (p.status === "paid") {
    const r = await callSheet(env, { action: "confirmPayment", ref, mollieId: id, amountCents: cents });
    // Feuille momentanément indisponible : code 500 pour que Mollie renvoie le webhook plus tard
    if (r.status === "busy" || r.status === "unreachable") return new Response("retry", { status: 500 });
  } else if (["failed", "canceled", "expired"].includes(p.status)) {
    await callSheet(env, { action: "expire", ref, mollieId: id, reason: p.status });
  }
  return new Response("ok");
}

export async function paymentStatus(request, env) {
  const ref = new URL(request.url).searchParams.get("ref") || "";
  if (!REF_RE.test(ref)) return fail("INVALID", "invalid", 400);
  const r = await callSheet(env, { action: "paymentInfo", ref });
  if (r.status === "not_found") return json({ ok: false, state: "unknown" }, 404);
  if (r.status !== "ok") return fail("UNAVAILABLE", "unavailable", 503);
  return json({ ok: true, state: r.state, amountCents: r.amountCents, items: r.items });
}

/* ------------------------------------------------------------------ espace client */

export async function myReservations(request, env) {
  const user = await userFromRequest(request, env);
  if (!user) return fail("UNAUTHORIZED", "unauthorized", 401);
  // Adresse lue dans le jeton vérifié (jamais envoyée par le navigateur) : réservations faites sans compte rattachées
  const r = await callSheet(env, { action: "listForUser", userId: user.id, email: user.email });
  if (r.status !== "ok") return fail("UNAVAILABLE", "unavailable", 503);
  return json({ ok: true, reservations: r.reservations || r.items || [] });
}

export async function exportAccount(request, env) {
  const user = await userFromRequest(request, env);
  if (!user) return fail("UNAUTHORIZED", "unauthorized", 401);
  const [profile, companies, certificates, bookings] = await Promise.all([
    supabase(env, `/rest/v1/profiles?id=eq.${user.id}&select=*`),
    supabase(env, `/rest/v1/company_members?user_id=eq.${user.id}&select=role,companies(*)`),
    supabase(env, `/rest/v1/certificates?user_id=eq.${user.id}&select=participant_name,formation_slug,reservation_ref,issued_on,valid_until`),
    callSheet(env, { action: "listForUser", userId: user.id, email: user.email }),
  ]);
  const data = { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email }, profile: (profile.data || [])[0] || null,
    companies: companies.data || [], certificates: certificates.data || [], reservations: bookings.reservations || bookings.items || [] };
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": 'attachment; filename="centre-cfs-mes-donnees.json"', "Cache-Control": "no-store" } });
}

export async function deleteAccount(request, env) {
  const user = await userFromRequest(request, env);
  if (!user) return fail("UNAUTHORIZED", "unauthorized", 401);
  const body = await request.json().catch(() => ({}));
  if (String(body.confirmEmail || "").toLowerCase() !== user.email.toLowerCase()) return fail("INVALID", "confirm", 400, { fields: { confirm_email: "invalid" } });
  // Réservations liées à une facture : anonymisées et gardées pour la comptabilité (la feuille s'en charge)
  const a = await callSheet(env, { action: "anonymizeUser", userId: user.id });
  if (a.status !== "ok") return fail("UNAVAILABLE", "unavailable", 503);
  const d = await supabase(env, `/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  if (!d.ok) return fail("UNAVAILABLE", "unavailable", 503);
  await supabase(env, "/rest/v1/audit_log", { method: "POST", body: JSON.stringify({ actor: user.id, action: "account.delete", entity: "user", entity_id: user.id }) });
  return json({ ok: true });
}

/* ------------------------------------------------------------------ e-mails d'authentification */

export async function supabaseEmailHook(request, env) {
  const raw = await request.text();
  if (!(await verifyWebhook(request, raw, env.SUPABASE_EMAIL_HOOK_SECRET))) {
    return json({ error: { http_code: 401, message: "invalid signature" } }, 401);
  }
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: { http_code: 400, message: "bad payload" } }, 400); }
  const user = body.user || {};
  const d = body.email_data || {};
  const lang = ["fr", "nl", "en"].includes(user.user_metadata && user.user_metadata.locale) ? user.user_metadata.locale : "fr";
  const type = String(d.email_action_type || "magiclink");
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const url = d.token_hash ? `${base}/auth/v1/verify?token=${encodeURIComponent(d.token_hash)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(d.redirect_to || env.SITE_URL || "")}` : "";
  const mail = authEmail({ site: String(env.SITE_URL || "https://centrecfs.be"), lang, type, url, code: d.token || "" });
  // Priorité P1 dans le compteur mensuel partagé avec la feuille (sans feuille : envoi quand même)
  const quota = await callSheet(env, { action: "countEmail", priority: "P1", n: 1, label: `Auth ${type}` });
  if (quota.status === "ok" && quota.allowed === false) return json({ error: { http_code: 503, message: "email quota reached" } }, 503);
  const sent = await sendEmail(env, { template: "client", to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
  if (!sent.ok) return json({ error: { http_code: 502, message: t(lang, "form.error_text") } }, 502);
  return json({});
}
