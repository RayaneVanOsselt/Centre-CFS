// @ts-check
/**
 * Vérifications cryptographiques, avec WebCrypto seulement (aucune dépendance) :
 *  - jeton d'accès Supabase (JWT ES256 ou RS256, clés publiques JWKS du projet, mises en cache 10 minutes) ;
 *  - signature « Standard Webhooks » du hook d'e-mails de Supabase.
 */

const enc = new TextEncoder();

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function b64ToBytes(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function bytesToB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** @type {{ url: string, at: number, keys: any[] } | null} */
let jwksCache = null;

async function jwks(url, fetchImpl) {
  if (jwksCache && jwksCache.url === url && Date.now() - jwksCache.at < 600000) return jwksCache.keys;
  const r = await fetchImpl(url);
  const d = await r.json().catch(() => ({}));
  const keys = Array.isArray(d.keys) ? d.keys : [];
  jwksCache = { url, at: Date.now(), keys };
  return keys;
}

/**
 * Vérifie le jeton « Authorization: Bearer … » d'une requête. Renvoie l'utilisateur, ou null.
 * @param {Request} request
 * @param {Record<string, any>} env
 * @returns {Promise<{ id: string, email: string, role: string, aal: string } | null>}
 */
export async function userFromRequest(request, env, fetchImpl = fetch) {
  const h = request.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token || !env.SUPABASE_URL) return null;
  return verifyJwt(token, env, fetchImpl);
}

/**
 * @param {string} token
 * @param {Record<string, any>} env
 */
export async function verifyJwt(token, env, fetchImpl = fetch) {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    const base = env.SUPABASE_URL.replace(/\/$/, "");
    const keys = await jwks(`${base}/auth/v1/.well-known/jwks.json`, fetchImpl);
    const jwk = keys.find((k) => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null);
    if (!jwk) return null;
    let algo, verifyAlgo;
    if (header.alg === "ES256") { algo = { name: "ECDSA", namedCurve: "P-256" }; verifyAlgo = { name: "ECDSA", hash: "SHA-256" }; }
    else if (header.alg === "RS256") { algo = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }; verifyAlgo = { name: "RSASSA-PKCS1-v1_5" }; }
    else return null;
    const key = await crypto.subtle.importKey("jwk", jwk, algo, false, ["verify"]);
    const ok = await crypto.subtle.verify(verifyAlgo, key, b64urlToBytes(s), enc.encode(`${h}.${p}`));
    const now = Math.floor(Date.now() / 1000);
    if (!ok || !payload.sub || (payload.exp && payload.exp < now - 30)) return null;
    if (payload.iss && payload.iss !== `${base}/auth/v1`) return null;
    if (payload.aud && payload.aud !== "authenticated" && !(Array.isArray(payload.aud) && payload.aud.includes("authenticated"))) return null;
    return { id: String(payload.sub), email: String(payload.email || ""), role: String((payload.app_metadata && payload.app_metadata.role) || ""), aal: String(payload.aal || "aal1") };
  } catch {
    return null;
  }
}

/**
 * Signature « Standard Webhooks » (en-têtes webhook-id, webhook-timestamp, webhook-signature « v1,<base64> »).
 * Le secret Supabase a la forme « v1,whsec_<base64> ».
 * @param {Request} request
 * @param {string} body  corps brut
 * @param {string} secret
 */
export async function verifyWebhook(request, body, secret) {
  if (!secret) return false;
  const id = request.headers.get("webhook-id") || "";
  const ts = request.headers.get("webhook-timestamp") || "";
  const sigs = (request.headers.get("webhook-signature") || "").split(" ");
  if (!id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const raw = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey("raw", b64ToBytes(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = bytesToB64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${body}`))));
  return sigs.some((s) => s.startsWith("v1,") && timingSafeEqual(s.slice(3), mac));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
