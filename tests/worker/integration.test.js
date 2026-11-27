/* Worker ↔ moteur Google Sheets : le vrai Worker parle au vrai reservations.gs (fausse feuille), avec la signature HMAC.
   Exemple de la mission : VCA Base, 10 places → 9 sur 10 après une réservation ; « Merci… Référence » seulement si ok. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../../worker/src/index.js";
import { callSheet } from "../../worker/src/lib/sheets.js";
import { runCron } from "../../worker/src/cron.js";
import { bench, CONTACT, post, REGISTRATION, SITE, withFetch } from "./harness.js";

const ctx = { waitUntil: () => {} };
const call = (b, req) => withFetch(b.fetchImpl, () => handleApi(req, b.env, ctx));
const sessionsOf = async (b) => (await (await call(b, new Request(SITE + "/api/sessions"))).json()).sessions;

test("signature : la feuille accepte le Worker et refuse un mauvais secret", async () => {
  const b = bench();
  const ok = await withFetch(b.fetchImpl, () => callSheet(b.env, { action: "sessions" }, { method: "GET" }));
  assert.equal(ok.status, "ok");
  const bad = await withFetch(b.fetchImpl, () => callSheet({ ...b.env, RESERVATIONS_HMAC_SECRET: "z".repeat(64) }, { action: "sessions" }, { method: "GET" }));
  assert.equal(bad.status, "unauthorized");
  const missing = await callSheet({}, { action: "sessions" }, { method: "GET" });
  assert.equal(missing.status, "unreachable");
});

test("GET /api/sessions : places en direct, aucune donnée personnelle, filtre par formation", async () => {
  const b = bench();
  const list = await sessionsOf(b);
  const vca = list.find((s) => s.id === b.sessionId);
  assert.equal(vca.capacity, 10);
  assert.equal(vca.remaining, 10);
  assert.equal(vca.state, "open");
  const harnais = list.find((s) => s.training === "harnais");
  assert.equal(harnais.state, "low", "2 places sur 2 : sous le seuil de 3");
  const r = await call(b, new Request(SITE + "/api/sessions?formation=harnais"));
  const one = await r.json();
  assert.equal(one.sessions.length, 1);
  assert.match(r.headers.get("Cache-Control"), /max-age=30/);
  const etag = r.headers.get("ETag");
  assert.ok(etag);
  const again = await call(b, new Request(SITE + "/api/sessions?formation=harnais", { headers: { "If-None-Match": etag } }));
  assert.equal(again.status, 304, "liste inchangée : 304 sans corps");
  assert.doesNotMatch(JSON.stringify(one), /@|Dupont|phone/);
});

test("réservation entreprise sur facture : 10 → 9 sur 10, puis 4 places → 5, refus de 6, complet", async () => {
  const b = bench();
  const r1 = await (await call(b, post("/api/registrations", REGISTRATION(b.sessionId)))).json();
  assert.equal(r1.ok, true);
  assert.match(r1.reference, /^CFS-\d{4}-/);
  assert.equal(r1.status, "pending_invoice");
  assert.equal(r1.remaining, 9, "places renvoyées tout de suite au navigateur");
  assert.equal(r1.capacity, 10);
  assert.equal((await sessionsOf(b)).find((s) => s.id === b.sessionId).remaining, 9, "l'exemple de la mission : 9 sur 10");

  const four = Array.from({ length: 4 }, (_, i) => ({ firstName: "P" + i, lastName: "Test" }));
  const r2 = await (await call(b, post("/api/registrations", REGISTRATION(b.sessionId, { participants: four, customer: { firstName: "Luc", lastName: "B", email: "luc@exemple.be", phone: "0470 11 11 11" } })))).json();
  assert.equal(r2.ok, true);
  assert.equal((await sessionsOf(b)).find((s) => s.id === b.sessionId).remaining, 5);

  const six = Array.from({ length: 6 }, (_, i) => ({ firstName: "Q" + i, lastName: "Test" }));
  const r3 = await call(b, post("/api/registrations", REGISTRATION(b.sessionId, { participants: six, customer: { firstName: "Ana", lastName: "C", email: "ana@exemple.be", phone: "0470 22 22 22" } })));
  assert.equal(r3.status, 409);
  const j3 = await r3.json();
  assert.equal(j3.ok, false);
  assert.equal(j3.code, "NOT_ENOUGH");
  assert.equal(j3.remaining, 5);
  assert.doesNotMatch(JSON.stringify(j3), /CFS-/, "aucune référence sans réservation");
});

test("double envoi (même requestId) : une seule réservation, même référence", async () => {
  const b = bench();
  const body = REGISTRATION(b.sessionId);
  const a = await (await call(b, post("/api/registrations", body))).json();
  const c = await (await call(b, post("/api/registrations", body))).json();
  assert.equal(a.reference, c.reference);
  assert.equal((await sessionsOf(b)).find((s) => s.id === b.sessionId).remaining, 9);
});

test("particulier sans paiement en ligne : demande d'inscription (CFD), aucune place bloquée, e-mail à l'équipe", async () => {
  const b = bench();
  const body = REGISTRATION(b.sessionId, { payMode: "online", billing: { type: "individual", street: "Rue 1", zip: "4000", city: "Liège" } });
  const r = await (await call(b, post("/api/registrations", body))).json();
  assert.equal(r.ok, true);
  assert.equal(r.status, "request");
  assert.match(r.reference, /^CFD-/);
  assert.equal((await sessionsOf(b)).find((s) => s.id === b.sessionId).remaining, 10);
  assert.equal(b.calls.emails.length, 1);
  assert.equal(b.calls.emails[0].template_id, "template_equipe");
  assert.equal(b.calls.emails[0].template_params.reply_to, "marie@exemple.be");
});

test("contact : écrit dans la feuille AVANT l'e-mail ; référence seulement si ok ; robot ignoré", async () => {
  const b = bench();
  const r = await (await call(b, post("/api/contact", CONTACT()))).json();
  assert.equal(r.ok, true);
  assert.match(r.reference, /^CFD-/);
  assert.equal(b.G.sheet("Demandes").records().length, 1);
  assert.deepEqual(b.calls.sheet.map((c) => c.action), ["contact"]);
  assert.equal(b.calls.emails.length, 1);
  assert.match(b.calls.emails[0].template_params.subject, new RegExp(r.reference));
  // Robot : champ piège rempli → réponse normale, rien d'écrit, aucun e-mail
  const bot = await (await call(b, post("/api/contact", CONTACT({ website: "http://spam", email: "bot@exemple.be" })))).json();
  assert.equal(bot.ok, true);
  assert.equal(b.G.sheet("Demandes").records().length, 1);
  assert.equal(b.calls.emails.length, 1);
  // Erreurs de saisie : 400 et champs en défaut, aucune référence
  const bad = await call(b, post("/api/contact", CONTACT({ email: "x", email2: "" })));
  assert.equal(bad.status, 400);
  const jb = await bad.json();
  assert.equal(jb.ok, false);
  assert.equal(jb.fields.email, "invalid");
  assert.equal("reference" in jb, false);
});

test("contact sans JavaScript (formulaire HTML) : page de confirmation traduite", async () => {
  const b = bench();
  const form = new URLSearchParams({ form: "devis", lang: "nl", name: "Jan Peeters", email: "jan@exemple.be", company: "Voorbeeld BV", message: "Offerte VCA voor 8 personen", consent: "on" });
  const req = new Request(SITE + "/api/contact", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: SITE }, body: form.toString() });
  const r = await call(b, req);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /text\/html/);
  const html = await r.text();
  assert.match(html, /lang="nl"/);
  assert.match(html, /CFD-\d{4}-/);
});

test("feuille injoignable, sans boîte de secours ni e-mail : 503, jamais de « Merci »", async () => {
  const b = bench({ env: { RESERVATIONS_API_URL: "https://script.google.com/macros/s/DOWN/exec", EMAILJS_PRIVATE_KEY: "" } });
  const fetchDown = async (url, init) => {
    if (String(url).includes("/DOWN/")) throw new TypeError("network");
    return b.fetchImpl(url, init);
  };
  const r = await withFetch(fetchDown, () => handleApi(post("/api/contact", CONTACT()), b.env, ctx));
  assert.equal(r.status, 503);
  const j = await r.json();
  assert.equal(j.ok, false);
  assert.equal("reference" in j, false);
});

test("feuille injoignable avec Supabase : demande gardée (CFW), rejouée par la tâche planifiée sans doublon", async () => {
  const outbox = [];
  const b = bench({
    env: { RESERVATIONS_API_URL: "https://script.google.com/macros/s/DOWN/exec", SUPABASE_URL: "https://sb.test", SUPABASE_SECRET_KEY: "sb_secret_test" },
    supabase: (url, init) => {
      if (url.pathname === "/rest/v1/outbox_requests" && init.method === "POST") { outbox.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
      if (url.pathname === "/rest/v1/outbox_requests" && (init.method || "GET") === "GET") return Response.json(outbox.map((o) => ({ ...o, created_at: new Date().toISOString(), attempts: 0 })));
      return null;
    },
  });
  const down = async (url, init) => (String(url).includes("/DOWN/") ? Promise.reject(new TypeError("network")) : b.fetchImpl(url, init));
  const r = await (await withFetch(down, () => handleApi(post("/api/contact", CONTACT()), b.env, ctx))).json();
  assert.equal(r.ok, true);
  assert.match(r.reference, /^CFW-/);
  assert.equal(outbox.length, 1);
  assert.equal(b.calls.emails.length, 1, "e-mail direct à l'équipe");
  // La feuille revient : la tâche planifiée rejoue la demande, puis la supprime de la boîte de secours
  const report = await withFetch(b.fetchImpl, () => runCron({ ...b.env, RESERVATIONS_API_URL: "https://script.google.com/macros/s/TEST/exec" }));
  assert.equal(report.replayed, 1);
  assert.equal(b.G.sheet("Demandes").records().length, 1);
  assert.ok(b.calls.supabase.some((c) => c.method === "DELETE" && c.path.includes("request_id=eq.")));
});

test("paiement en ligne (Mollie test) : montant calculé par la feuille, webhook relu, confirmé une seule fois", async () => {
  let mollieStatus = "open";
  const b = bench({ env: { ONLINE_PAYMENT_ENABLED: "1", MOLLIE_API_KEY: "test_abc" }, mollieStatus: () => mollieStatus });
  const body = REGISTRATION(b.sessionId, { payMode: "online", billing: { type: "individual", street: "Rue 1", zip: "4000", city: "Liège" }, amount: 1 });
  const r = await (await call(b, post("/api/registrations", body))).json();
  assert.equal(r.ok, true);
  assert.equal(r.status, "pending_payment");
  assert.match(r.paymentUrl, /^https:\/\/www\.mollie\.com\/checkout\//);
  const created = b.calls.mollie.find((c) => c.method === "POST");
  assert.equal(created.body.amount.value, "302.50", "250 € HTVA + 21 % : jamais le montant du navigateur");
  assert.equal(created.body.metadata.reference, r.reference);
  assert.equal(created.body.webhookUrl, SITE + "/api/payments/mollie-webhook");
  assert.equal((await sessionsOf(b)).find((s) => s.id === b.sessionId).remaining, 9, "place bloquée 30 minutes");

  const paymentId = Object.keys(b.payments)[0];
  const hook = () => call(b, new Request(SITE + "/api/payments/mollie-webhook", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "id=" + paymentId }));
  // Webhook avant paiement : rien ne change
  assert.equal((await hook()).status, 200);
  let st = await (await call(b, new Request(SITE + "/api/payments/status?ref=" + r.reference))).json();
  assert.equal(st.state, "pending");
  mollieStatus = "paid";
  assert.equal((await hook()).status, 200);
  assert.equal((await hook()).status, 200, "webhook rejoué");
  st = await (await call(b, new Request(SITE + "/api/payments/status?ref=" + r.reference))).json();
  assert.equal(st.state, "paid");
  assert.equal(st.amountCents, 30250);
  assert.doesNotMatch(JSON.stringify(st), /@|Dupont/, "aucune donnée personnelle sur la page de retour");
  const rows = b.G.sheet("Réservations").records();
  assert.equal(rows.length, 1);
});

test("webhook Mollie : identifiant inconnu ou falsifié → réponse neutre, rien n'est modifié", async () => {
  const b = bench({ env: { ONLINE_PAYMENT_ENABLED: "1", MOLLIE_API_KEY: "test_abc" } });
  const r = await call(b, new Request(SITE + "/api/payments/mollie-webhook", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "id=tr_unknown99" }));
  assert.equal(r.status, 200);
  const r2 = await call(b, new Request(SITE + "/api/payments/mollie-webhook", { method: "POST", body: "id=<script>" }));
  assert.equal(r2.status, 200);
  assert.equal(b.calls.sheet.filter((c) => c.action === "confirmPayment").length, 0);
});

test("espace client : sans jeton valide → 401", async () => {
  const b = bench({ env: { SUPABASE_URL: "https://sb.test" } });
  const r = await call(b, new Request(SITE + "/api/account/reservations"));
  assert.equal(r.status, 401);
  const d = await call(b, new Request(SITE + "/api/account/delete", { method: "POST", headers: { Origin: SITE, Authorization: "Bearer a.b.c" }, body: "{}" }));
  assert.equal(d.status, 401);
});
