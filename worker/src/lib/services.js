// @ts-check
/**
 * Services externes appelés par le Worker : Turnstile, Supabase (REST, service), EmailJS (API REST + clé privée),
 * Mollie. Chaque fonction renvoie un résultat simple ; aucune ne lève d'erreur vers l'appelant.
 */

const json = (r) => r.json().catch(() => null);

/* ---------------- Turnstile ---------------- */

/**
 * @param {Record<string, any>} env
 * @param {string} token
 * @param {string} ip
 * @returns {Promise<boolean>} true si vérifié, ou si Turnstile n'est pas configuré (développement)
 */
export async function verifyTurnstile(env, token, ip, fetchImpl = fetch) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const r = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const d = await json(r);
    return Boolean(d && d.success);
  } catch {
    return false;
  }
}

/* ---------------- Supabase (clé secrète, côté serveur uniquement) ---------------- */

export function supabaseConfigured(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);
}

/**
 * Appel REST de Supabase avec la clé secrète (contourne la RLS : réservé aux opérations du serveur).
 * @param {Record<string, any>} env
 * @param {string} path  « /rest/v1/… » ou « /auth/v1/… »
 * @param {RequestInit} [init]
 */
export async function supabase(env, path, init = {}, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) return { ok: false, status: 0, data: null };
  const key = String(env.SUPABASE_SECRET_KEY);
  // Nouvelles clés (sb_secret_…) : en-tête apikey seul ; anciennes clés JWT (service_role) : apikey + Authorization
  const auth = key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` };
  try {
    const r = await fetchImpl(env.SUPABASE_URL.replace(/\/$/, "") + path, {
      ...init,
      headers: { apikey: key, ...auth, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    return { ok: r.ok, status: r.status, data: r.status === 204 ? null : await json(r) };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/** Empreinte salée d'une adresse IP (jamais l'adresse en clair). */
export async function ipHash(env, ip) {
  const data = new TextEncoder().encode(`${env.IP_HASH_SALT || "dev-salt"}:${ip || "?"}`);
  const h = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(h).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Limite de débit (fonction SQL rate_hit, migrations Supabase). Sans Supabase : autorisé (la feuille a ses propres limites).
 * @returns {Promise<boolean>} true si la requête est autorisée
 */
export async function rateLimit(env, key, limit, windowSeconds, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) return true;
  const r = await supabase(env, "/rest/v1/rpc/rate_hit", { method: "POST", body: JSON.stringify({ p_key: key, p_limit: limit, p_window: windowSeconds }) }, fetchImpl);
  return r.ok ? r.data !== false : true;
}

/* ---------------- EmailJS (serveur uniquement : clé privée) ---------------- */

export function emailConfigured(env) {
  return Boolean(env.EMAILJS_SERVICE_ID && env.EMAILJS_PUBLIC_KEY && env.EMAILJS_PRIVATE_KEY && env.EMAILJS_TEMPLATE_CLIENT && env.EMAILJS_TEMPLATE_EQUIPE);
}

/**
 * Envoie un e-mail avec l'un des deux modèles génériques (« client » ou « equipe », voir README-EMAILJS.md).
 * @param {Record<string, any>} env
 * @param {{ template: "client" | "equipe", to?: string, bcc?: string, replyTo?: string, subject: string, html: string, text: string }} m
 */
export async function sendEmail(env, m, fetchImpl = fetch) {
  if (!emailConfigured(env)) return { ok: false, reason: "not_configured" };
  const params = { subject: m.subject, html: m.html, text: m.text };
  if (m.template === "client") Object.assign(params, { to_email: m.to, bcc: m.bcc || "" });
  else Object.assign(params, { reply_to: m.replyTo || "" });
  try {
    const r = await fetchImpl("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: env.EMAILJS_SERVICE_ID, template_id: m.template === "client" ? env.EMAILJS_TEMPLATE_CLIENT : env.EMAILJS_TEMPLATE_EQUIPE,
        user_id: env.EMAILJS_PUBLIC_KEY, accessToken: env.EMAILJS_PRIVATE_KEY, template_params: params }),
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/* ---------------- Mollie ---------------- */

export function mollieConfigured(env) {
  return Boolean(env.MOLLIE_API_KEY);
}

/** Montant en centimes → « 302.50 » (format Mollie). */
export function mollieValue(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/**
 * @param {Record<string, any>} env
 * @param {"POST" | "GET"} method
 * @param {string} path  « /payments » ou « /payments/tr_xxx »
 * @param {Record<string, any>} [body]
 */
export async function mollie(env, method, path, body, fetchImpl = fetch) {
  if (!mollieConfigured(env)) return { ok: false, data: null };
  try {
    const r = await fetchImpl("https://api.mollie.com/v2" + path, {
      method, headers: { Authorization: `Bearer ${env.MOLLIE_API_KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: r.ok, data: await json(r) };
  } catch {
    return { ok: false, data: null };
  }
}
