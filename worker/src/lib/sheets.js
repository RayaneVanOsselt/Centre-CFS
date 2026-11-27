// @ts-check
/**
 * Client signé de la feuille Google (apps-script/reservations.gs).
 *
 * Une application Web Apps Script ne donne pas accès aux en-têtes HTTP : horodatage, nonce et signature voyagent donc
 * dans le corps (POST) ou dans l'adresse (GET). Signature = HMAC-SHA256(secret, horodatage + "." + nonce + "." + contenu),
 * en hexadécimal ; contenu = « GET:<action> » pour une lecture, la chaîne JSON exacte du `payload` pour une écriture.
 * Le script refuse un écart de plus de 5 minutes, une signature fausse et un nonce déjà vu (DECISIONS.md, D-004).
 */
import { randomId } from "./http.js";

const enc = new TextEncoder();

/**
 * @param {string} secret
 * @param {string} message
 */
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {string} secret
 * @param {string} content
 * @param {number} [now] millisecondes
 */
export async function sign(secret, content, now = Date.now()) {
  const ts = Math.floor(now / 1000);
  const nonce = randomId(16);
  const sig = await hmacHex(secret, `${ts}.${nonce}.${content}`);
  return { ts, nonce, sig };
}

/** La feuille est-elle branchée ? */
export function sheetConfigured(env) {
  return Boolean(env.RESERVATIONS_API_URL && env.RESERVATIONS_HMAC_SECRET && String(env.RESERVATIONS_HMAC_SECRET).length >= 32);
}

/**
 * Appel signé à la feuille. Délai maximal : 8 s. Un seul nouvel essai si la feuille répond « busy ».
 * @param {Record<string, any>} env
 * @param {{ action: string, [k: string]: any }} body  pour un POST ; ou { action } avec method GET
 * @param {{ method?: "GET" | "POST", timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<Record<string, any>>}  la réponse JSON de la feuille, ou { status: "unreachable" }
 */
export async function callSheet(env, body, opts = {}) {
  if (!sheetConfigured(env)) return { status: "unreachable", reason: "not_configured" };
  const doFetch = opts.fetchImpl || fetch;
  const method = opts.method || "POST";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
    try {
      let res;
      if (method === "GET") {
        const s = await sign(env.RESERVATIONS_HMAC_SECRET, `GET:${body.action}`);
        const url = new URL(env.RESERVATIONS_API_URL);
        url.searchParams.set("action", body.action);
        url.searchParams.set("ts", String(s.ts));
        url.searchParams.set("nonce", s.nonce);
        url.searchParams.set("sig", s.sig);
        res = await doFetch(url.toString(), { method: "GET", redirect: "follow", signal: ctrl.signal });
      } else {
        const payload = JSON.stringify(body);
        const s = await sign(env.RESERVATIONS_HMAC_SECRET, payload);
        res = await doFetch(env.RESERVATIONS_API_URL, {
          method: "POST", redirect: "follow", signal: ctrl.signal,
          headers: { "Content-Type": "text/plain;charset=utf-8" },     // évite le pré-contrôle CORS côté Google
          body: JSON.stringify({ ts: s.ts, nonce: s.nonce, sig: s.sig, payload }),
        });
      }
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== "object") return { status: "unreachable", reason: "bad_response" };
      if (data.status === "busy" && attempt === 0) continue;
      return data;
    } catch (e) {
      return { status: "unreachable", reason: e && e.name === "AbortError" ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: "busy" };
}
