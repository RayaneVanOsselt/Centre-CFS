// @ts-check
/**
 * Validation des entrées, sans dépendance (mêmes règles que le navigateur, forms.js, et que la feuille, reservations.gs).
 * La feuille revalide tout : ces contrôles évitent seulement de la solliciter pour rien.
 */

export const EMAIL_RE = /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]{2,}$/;
export const PHONE_RE = /^[0-9+().\/\s-]{6,40}$/;
export const REQUEST_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const SESSION_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
export const PAGE_RE = /^\/[A-Za-z0-9._\/-]{0,160}$/;
export const CONTACT_FORMS = ["contact", "devis", "inscription", "salle", "prevenir", "assistant"];
export const LANGS = ["fr", "nl", "en"];

/** Texte nettoyé : espaces réduits, caractères de contrôle retirés, longueur bornée. */
export function clean(v, max = 200) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
/** Texte long (message) : retours à la ligne gardés. */
export function cleanText(v, max = 5000) {
  return String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

/** Numéro de TVA belge (BE0/BE1 + 9 chiffres, contrôle modulo 97) → « BE0123456749 » ou null. */
export function belgianVat(v) {
  let s = String(v || "").toUpperCase().replace(/[\s.\-]/g, "");
  if (s.startsWith("BE")) s = s.slice(2);
  if (/^\d{9}$/.test(s)) s = "0" + s;
  if (!/^[01]\d{9}$/.test(s)) return null;
  return 97 - (Number(s.slice(0, 8)) % 97) === Number(s.slice(8)) ? "BE" + s : null;
}

/**
 * Formulaire de contact / devis / salle / « être prévenu » / question transmise par l'assistant.
 * @param {Record<string, any>} b
 * @returns {{ value: Record<string, any>, fields: Record<string, string> }}
 */
export function validateContact(b) {
  /** @type {Record<string, string>} */
  const fields = {};
  const form = String(b.form || b.type || "");
  const v = {
    requestId: String(b.requestId || ""), form: CONTACT_FORMS.includes(form) ? form : "",
    lang: LANGS.includes(b.lang) ? b.lang : "fr", name: clean(b.name, 120), email: clean(b.email, 160).toLowerCase(),
    phone: clean(b.phone, 40), company: clean(b.company, 120), message: cleanText(b.message, 5000),
    training: clean(b.training, 64).toLowerCase(), sessionId: clean(b.sessionId, 80),
    page: PAGE_RE.test(String(b.page || "")) ? String(b.page) : "", consent: b.consent === true || b.consent === "1" || b.consent === "on",
    website: clean(b.website, 200), elapsed: Number(b.elapsedMs ?? b.elapsed),
  };
  if (!REQUEST_RE.test(v.requestId)) fields.requestId = "invalid";
  if (!v.form) fields.form = "invalid";
  if (!v.name) fields.name = "required";
  if (!EMAIL_RE.test(v.email)) fields.email = "invalid";
  if (v.phone && !PHONE_RE.test(v.phone)) fields.phone = "invalid";
  if (v.form === "contact" && v.message.length < 3) fields.message = "required";
  if (v.training && !SLUG_RE.test(v.training)) fields.training = "invalid";
  if (v.sessionId && !SESSION_RE.test(v.sessionId)) fields.sessionId = "invalid";
  if (!v.consent) fields.consent = "required";
  return { value: v, fields };
}

/**
 * Réservation (une session, ou une date à convenir). Le montant n'est JAMAIS lu ici : la feuille le calcule.
 * @param {Record<string, any>} b
 */
export function validateRegistration(b) {
  /** @type {Record<string, string>} */
  const fields = {};
  const c = b.customer && typeof b.customer === "object" ? b.customer : (b.contact && typeof b.contact === "object" ? b.contact : {});
  const bi = b.billing && typeof b.billing === "object" ? b.billing : {};
  const people = (Array.isArray(b.participants) ? b.participants : []).slice(0, 50).map((p) => ({
    firstName: clean(p && p.firstName, 80), lastName: clean(p && p.lastName, 80), email: clean(p && p.email, 160).toLowerCase(),
  })).filter((p) => p.firstName || p.lastName);
  const v = {
    requestId: String(b.requestId || ""), lang: LANGS.includes(b.lang || b.locale) ? (b.lang || b.locale) : "fr",
    training: clean(b.training, 64).toLowerCase(), sessionId: b.sessionId ? clean(b.sessionId, 80) : null,
    payMode: b.payMode === "online" || b.paymentMode === "online" ? "online" : "invoice",
    customer: { firstName: clean(c.firstName, 80), lastName: clean(c.lastName, 80), email: clean(c.email, 160).toLowerCase(), phone: clean(c.phone, 40) },
    billing: { type: bi.type === "company" ? "company" : "individual", company: clean(bi.company, 120), vat: clean(bi.vat, 20),
      street: clean(bi.street, 160), zip: clean(bi.zip, 12), city: clean(bi.city, 80), country: clean(bi.country || "BE", 40) },
    participants: people, notes: cleanText(b.notes, 1000), trainingLanguage: clean(b.trainingLanguage, 8),
    terms: b.terms === true || b.consent === true, website: clean(b.website, 200),
  };
  if (!REQUEST_RE.test(v.requestId)) fields.requestId = "invalid";
  if (!SLUG_RE.test(v.training)) fields.training = "invalid";
  if (v.sessionId && !SESSION_RE.test(v.sessionId)) fields.sessionId = "invalid";
  if (!v.customer.firstName) fields.firstName = "required";
  if (!v.customer.lastName) fields.lastName = "required";
  if (!EMAIL_RE.test(v.customer.email)) fields.email = "invalid";
  if (!PHONE_RE.test(v.customer.phone)) fields.phone = "invalid";
  for (const k of ["street", "zip", "city"]) if (!v.billing[k]) fields[k] = "required";
  if (v.billing.type === "company") {
    if (!v.billing.company) fields.company = "required";
    if (v.billing.vat) { const n = belgianVat(v.billing.vat); if (n) v.billing.vat = n; else fields.vat = "invalid"; }
  }
  if (!v.participants.length) fields.participants = "required";
  if (!v.terms) fields.terms = "required";
  return { value: v, fields };
}
