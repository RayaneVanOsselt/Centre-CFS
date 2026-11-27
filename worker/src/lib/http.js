// @ts-check
/**
 * Réponses et lecture des requêtes. Aucune réponse ne contient de détail technique : un code et un message traduit.
 */

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-store",
};

/**
 * @param {unknown} data
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...headers },
  });
}

/**
 * Erreur pour le navigateur : { ok: false, code, message, ...extra }.
 * @param {string} code
 * @param {string} message
 * @param {number} [status]
 * @param {Record<string, unknown>} [extra]
 */
export function fail(code, message, status = 400, extra = {}) {
  return json({ ok: false, code, message, ...extra }, status);
}

/** Taille maximale d'un corps de requête accepté (formulaires, chat). */
export const MAX_BODY = 20 * 1024;

/**
 * Lit le corps (JSON ou formulaire HTML classique), avec une limite de taille.
 * @param {Request} request
 * @returns {Promise<{ data: Record<string, any> | null, form: boolean, error?: string }>}
 */
export async function readBody(request) {
  const type = (request.headers.get("Content-Type") || "").toLowerCase();
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY) return { data: null, form: false, error: "too_large" };
  const text = await request.text();
  if (text.length > MAX_BODY) return { data: null, form: false, error: "too_large" };
  if (type.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    /** @type {Record<string, any>} */
    const data = {};
    for (const [k, v] of params) data[k] = v;
    return { data, form: true };
  }
  try {
    const data = JSON.parse(text || "{}");
    return { data: data && typeof data === "object" && !Array.isArray(data) ? data : null, form: false };
  } catch {
    return { data: null, form: false, error: "bad_json" };
  }
}

/** Échappe un texte pour du HTML (pages de confirmation sans JavaScript, e-mails). */
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}

/**
 * Page HTML minimale (formulaires envoyés sans JavaScript) : message + lien de retour, aux couleurs de la charte.
 * @param {{ lang: string, title: string, text: string, back: string, backLabel: string, status?: number }} o
 */
export function htmlPage(o) {
  const body = `<!doctype html><html lang="${esc(o.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(o.title)} | Centre CFS</title><link rel="stylesheet" href="/assets/css/main.css"></head>
<body><main id="contenu" class="section"><div class="wrap-narrow"><h1>${esc(o.title)}</h1><p class="lead">${esc(o.text)}</p>
<p><a class="btn btn--bleu" href="${esc(o.back)}">${esc(o.backLabel)}</a></p></div></main></body></html>`;
  return new Response(body, { status: o.status || 200, headers: { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS } });
}

/** Identifiant aléatoire (référence de secours, nonce). */
export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Référence lisible : PRÉFIXE-AAAA-XXXXX, sans 0/O ni 1/I. */
export function reference(prefix, date = new Date()) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint8Array(5);
  crypto.getRandomValues(a);
  return `${prefix}-${date.getUTCFullYear()}-${Array.from(a, (b) => chars[b % chars.length]).join("")}`;
}
