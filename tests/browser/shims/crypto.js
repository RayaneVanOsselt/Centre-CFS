// node:crypto (partie utilisée par les tests) en JavaScript synchrone : SHA-256, HMAC-SHA256, octets aléatoires.
import { Buffer } from "./buffer.js";

const K = [];
const H0 = [];
(function constants() {
  const frac = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
  let n = 2;
  const primes = [];
  while (primes.length < 64) {
    if (primes.every((p) => n % p !== 0)) primes.push(n);
    n++;
  }
  primes.forEach((p, i) => {
    if (i < 8) H0.push(frac(Math.sqrt(p)));
    K.push(frac(Math.cbrt(p)));
  });
})();

/** @param {Uint8Array} msg */
export function sha256(msg) {
  const l = msg.length;
  const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withPad.set(msg);
  withPad[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(withPad.length - 4, bits >>> 0);
  const H = H0.slice();
  const w = new Uint32Array(64);
  const rotr = (x, r) => (x >>> r) | (x << (32 - r));
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}

const bytes = (v) => (typeof v === "string" ? new TextEncoder().encode(v) : new Uint8Array(v));
const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

function hmac(key, msg) {
  let k = bytes(key);
  if (k.length > 64) k = sha256(k);
  const block = new Uint8Array(64);
  block.set(k);
  const ipad = block.map((x) => x ^ 0x36);
  const opad = block.map((x) => x ^ 0x5c);
  return sha256(concat(opad, sha256(concat(ipad, msg))));
}

function digester(compute) {
  const parts = [];
  const api = {
    update(v) { parts.push(bytes(v)); return api; },
    digest(enc) {
      const all = parts.reduce((a, b) => concat(a, b), new Uint8Array(0));
      const out = Buffer.from(compute(all));
      return enc ? out.toString(enc) : out;
    },
  };
  return api;
}

export function createHash(alg) {
  if (alg !== "sha256") throw new Error("seul sha256 est disponible");
  return digester(sha256);
}
export function createHmac(alg, key) {
  if (alg !== "sha256") throw new Error("seul sha256 est disponible");
  return digester((m) => hmac(key, m));
}
export function randomBytes(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return Buffer.from(a);
}
export default { createHash, createHmac, randomBytes };
