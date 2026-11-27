/* Banc d'essai du Worker : le VRAI apps-script/reservations.gs (fausse feuille, tests/helpers/gas-fake.js) derrière
   le VRAI client signé du Worker, et de faux EmailJS / Mollie / Supabase qui enregistrent ce qu'ils reçoivent.
   Prérequis : worker/src/generated/ (créé par « python3 site/build.py »). */
import { loadGas } from "../helpers/gas-fake.js";

export const SECRET = "s".repeat(64);
export const SHEET_URL = "https://script.google.com/macros/s/TEST/exec";
export const SITE = "https://centrecfs.be";

/** Date « AAAA-MM-JJ » dans `days` jours (les sessions de test sont toujours à venir, quel que soit le jour du test). */
export function inDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/**
 * @param {{ seed?: any[], env?: Record<string, string>, supabase?: (url: URL, init: any) => any, mollieStatus?: () => string }} [o]
 */
export function bench(o = {}) {
  const G = loadGas("apps-script/reservations.gs", { now: () => new Date(), props: { RESERVATIONS_HMAC_SECRET: SECRET } });
  G.ctx.FORMATIONS = [
    ["vca-base", "VCA Base", "vca", 250, "1 jour (8 h)", 10, true],
    ["harnais", "Harnais et travail en hauteur", "equipements", null, "", null, true],
  ];
  const d = inDays(20);
  G.ctx.SEED_SESSIONS = o.seed || [
    { training: "vca-base", date: d, start: "08:30", end: "17:00", location: "charleroi", capacity: 10, language: "fr" },
    { training: "harnais", date: inDays(25), start: "08:30", end: "16:00", location: "engis", capacity: 2, language: "fr" },
  ];
  G.ctx.install();
  const sessionId = `${d}-vca-base-charleroi`;
  const calls = { emails: [], mollie: [], supabase: [], sheet: [] };
  const payments = {};
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.href.startsWith(SHEET_URL)) {
      if (method === "GET") {
        calls.sheet.push({ method, action: url.searchParams.get("action") });
        return Response.json(JSON.parse(G.ctx.doGet({ parameter: Object.fromEntries(url.searchParams) }).text));
      }
      const env = JSON.parse(init.body);
      calls.sheet.push({ method, action: JSON.parse(env.payload).action });
      return Response.json(JSON.parse(G.ctx.doPost({ postData: { contents: init.body } }).text));
    }
    if (url.hostname === "api.emailjs.com") {
      calls.emails.push(JSON.parse(init.body));
      return new Response("OK");
    }
    if (url.hostname === "api.mollie.com") {
      calls.mollie.push({ method, path: url.pathname, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization });
      if (method === "POST" && url.pathname === "/v2/payments") {
        const body = JSON.parse(init.body);
        const id = "tr_test" + String(Object.keys(payments).length + 1).padStart(5, "0");
        payments[id] = { id, amount: body.amount, metadata: body.metadata, status: "open", _links: { checkout: { href: `https://www.mollie.com/checkout/${id}` } } };
        return Response.json(payments[id], { status: 201 });
      }
      const id = url.pathname.split("/").pop();
      if (!payments[id]) return Response.json({ status: 404 }, { status: 404 });
      return Response.json({ ...payments[id], status: o.mollieStatus ? o.mollieStatus() : payments[id].status });
    }
    if (url.hostname === "sb.test") {
      calls.supabase.push({ method, path: url.pathname + url.search, body: init.body ? JSON.parse(init.body) : null });
      const r = o.supabase ? o.supabase(url, init) : null;
      if (r) return r;
      if (url.pathname === "/rest/v1/rpc/rate_hit") return Response.json(true);
      return new Response(null, { status: 201 });
    }
    if (url.hostname === "challenges.cloudflare.com") return Response.json({ success: true });
    throw new Error("Appel réseau inattendu : " + url.href);
  };
  const env = {
    SITE_URL: SITE, RESERVATIONS_API_URL: SHEET_URL, RESERVATIONS_HMAC_SECRET: SECRET, VAT_RATE: "0.21",
    EMAILJS_SERVICE_ID: "service_t", EMAILJS_PUBLIC_KEY: "public_t", EMAILJS_PRIVATE_KEY: "private_t",
    EMAILJS_TEMPLATE_CLIENT: "template_client", EMAILJS_TEMPLATE_EQUIPE: "template_equipe",
    ...(o.env || {}),
  };
  return { G, env, calls, payments, fetchImpl, sessionId };
}

/** Remplace fetch le temps d'un test (les routes du Worker utilisent le fetch global). */
export async function withFetch(fetchImpl, fn) {
  const saved = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = saved;
  }
}

/** Requête POST JSON vers le Worker, comme le navigateur. */
export function post(path, body, headers = {}) {
  return new Request(SITE + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: SITE, ...headers }, body: JSON.stringify(body) });
}

let seq = 0;
export function rid(prefix = "req") {
  seq++;
  return `${prefix}-${Date.now().toString(36)}-${String(seq).padStart(4, "0")}`;
}

export const CONTACT = (extra = {}) => ({ requestId: rid("contact"), form: "contact", lang: "fr", name: "Marie Dupont", email: "marie@exemple.be",
  phone: "0470 00 00 00", message: "Bonjour, avez-vous une session VCA en janvier ?", consent: true, elapsedMs: 9000, ...extra });

export const REGISTRATION = (sessionId, extra = {}) => ({
  requestId: rid("reg"), lang: "fr", training: "vca-base", sessionId, payMode: "invoice", elapsedMs: 12000, terms: true,
  customer: { firstName: "Marie", lastName: "Dupont", email: "marie@exemple.be", phone: "0470 00 00 00" },
  billing: { type: "company", company: "Exemple SRL", vat: "BE0403170701", street: "Rue de l'Exemple 1", zip: "4000", city: "Liège", country: "BE" },
  participants: [{ firstName: "Jean", lastName: "Peeters" }],
  ...extra,
});
