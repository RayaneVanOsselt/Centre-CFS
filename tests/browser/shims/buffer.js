// Petit équivalent de Buffer (Node) pour les tests dans le navigateur : utf8, hex, base64, base64url.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return s;
}
function fromB64(s) {
  const clean = s.replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : -1));
    const n = (c[0] << 18) | (c[1] << 12) | ((c[2] < 0 ? 0 : c[2]) << 6) | (c[3] < 0 ? 0 : c[3]);
    out.push((n >> 16) & 255);
    if (c[2] >= 0) out.push((n >> 8) & 255);
    if (c[3] >= 0) out.push(n & 255);
  }
  return out;
}

export class Buffer extends Uint8Array {
  static from(input, enc) {
    if (typeof input === "string") {
      if (enc === "base64" || enc === "base64url") return new Buffer(fromB64(input));
      if (enc === "hex") return new Buffer((input.match(/../g) || []).map((h) => parseInt(h, 16)));
      return new Buffer(new TextEncoder().encode(input));
    }
    if (input instanceof ArrayBuffer) return new Buffer(new Uint8Array(input));
    return new Buffer(Array.from(input));
  }
  toString(enc = "utf8") {
    if (enc === "hex") return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("");
    if (enc === "base64") return toB64(this);
    if (enc === "base64url") return toB64(this).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return new TextDecoder().decode(this);
  }
}
