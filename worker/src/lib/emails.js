// @ts-check
/**
 * E-mails construits côté serveur (Worker) dans la langue du destinataire : tableaux simples compatibles avec les
 * messageries, liens absolus, données échappées, version texte, poids bien inférieur aux 50 Ko d'EmailJS.
 * Les textes viennent de site/content/ui.{fr,nl,en}.json (clés email.*), copiés par site/build.py dans generated/ui.json.
 */
import { esc } from "./http.js";
import UI from "../generated/ui.json" with { type: "json" };

/**
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(lang, key, vars = {}) {
  const dict = UI[lang] || UI.fr;
  const s = dict[key] ?? UI.fr[key] ?? key;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

/**
 * Gabarit commun : bandeau bleu, titre, contenu, bouton éventuel, pied de page.
 * @param {{ site: string, lang: string, title: string, inner: string, cta?: { label: string, url: string } }} o
 */
export function frame(o) {
  const btn = o.cta
    ? `<tr><td style="padding:8px 32px 24px"><a href="${esc(o.cta.url)}" style="display:inline-block;background:#0D4A8C;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px">${esc(o.cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html lang="${esc(o.lang)}"><body style="margin:0;background:#F2F5F9;font-family:Arial,Helvetica,sans-serif;color:#0F1C2E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0D4A8C;color:#ffffff;padding:18px 32px;font-size:18px;font-weight:700">Centre CFS <span style="font-weight:400;font-size:13px;color:#DCE7F4">${esc(t(o.lang, "email.tagline"))}</span></td></tr>
<tr><td style="height:6px;background:#F7B500"></td></tr>
<tr><td style="padding:28px 32px 8px"><h1 style="margin:0 0 12px;font-size:22px">${esc(o.title)}</h1>${o.inner}</td></tr>
${btn}
<tr><td style="padding:16px 32px 24px;border-top:1px solid #D7DFE8;font-size:12px;color:#4A5869">${esc(t(o.lang, "email.footer"))}<br>Centre CFS · Rue de la Paix 12, 4480 Engis · 0475 34 02 89 · <a href="${esc(o.site)}" style="color:#0D4A8C">${esc(o.site.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** Texte brut à partir du HTML (version texte de l'e-mail). */
export function plain(html) {
  return String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|tr|h1|li)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * E-mail à l'équipe pour une demande du site (contact, devis, salle, « être prévenu », question de l'assistant).
 * « Répondre » s'adresse au visiteur ; son message est recopié, échappé. Toujours en français (équipe).
 * @param {string} site
 * @param {Record<string, any>} req  demande validée
 * @param {string} reference
 * @param {string} [trainingName]
 */
export function teamRequestEmail(site, req, reference, trainingName = "") {
  const label = { contact: "Question", devis: "Demande de devis", inscription: "Demande d'inscription", salle: "Location de salle",
    prevenir: "Être prévenu des prochaines dates", assistant: "Question transmise par l'assistant" }[req.form] || "Demande";
  const rows = [["Référence", reference], ["Nom", req.name], ["Entreprise", req.company], ["E-mail", req.email], ["Téléphone", req.phone],
    ["Formation", trainingName || req.training], ["Session", req.sessionId], ["Langue", req.lang.toUpperCase()], ["Page", req.page]]
    .filter(([, v]) => v);
  const table = `<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="color:#4A5869;padding-right:16px">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`;
  const msg = req.message ? `<p style="white-space:pre-line;background:#F2F5F9;padding:12px;border-radius:6px">${esc(req.message)}</p>` : "";
  const html = frame({ site, lang: "fr", title: label, inner: table + msg });
  return { subject: `[Site] ${label} : ${req.name}${req.company ? ", " + req.company : ""} (${reference})`, html, text: plain(html) };
}

/**
 * E-mail d'authentification Supabase (inscription, lien magique, récupération, changement d'adresse, invitation, code).
 * @param {{ site: string, lang: string, type: string, url?: string, code?: string }} o
 */
export function authEmail(o) {
  const map = { signup: "signup", magiclink: "magiclink", recovery: "recovery", email_change: "email_change", email: "email_change",
    invite: "invite", reauthentication: "otp" };
  const kind = map[o.type] || "magiclink";
  const k = (s) => `email.auth_${kind}_${s}`;
  let inner = `<p>${esc(t(o.lang, k("body"), { code: o.code || "" }))}</p>`;
  if (kind !== "otp") inner += `<p style="color:#4A5869;font-size:13px">${esc(t(o.lang, "email.auth_expiry"))}</p>`;
  inner += `<p style="color:#4A5869;font-size:13px">${esc(t(o.lang, "email.auth_ignore"))}</p>`;
  const cta = kind !== "otp" && o.url ? { label: t(o.lang, k("cta")), url: o.url } : undefined;
  const html = frame({ site: o.site, lang: o.lang, title: t(o.lang, k("title")), inner, cta });
  return { subject: t(o.lang, k("subject")), html, text: plain(html) };
}
