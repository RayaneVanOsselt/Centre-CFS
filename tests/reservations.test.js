/* Moteur Google Sheets : le VRAI apps-script/reservations.gs exécuté sur une fausse feuille (tests/helpers/gas-fake.js).
   Cas repris de Wisy Safety et étendus au paiement : réservations successives, dernière place disputée, écriture
   concurrente pendant l'attente du verrou, double envoi, tout ou rien, clôture 48 h, expiration, paiement confirmé deux
   fois, annulation de session, signature invalide ou périmée, quota d'e-mails.

   Ce que ces tests NE prouvent PAS : le comportement réel de Google (verrou entre deux exécutions parallèles, délais,
   quotas). Voir scripts/test-reservations-live.js, à lancer sur une session de TEST après la mise en service. */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { loadGas } from "./helpers/gas-fake.js";

const SECRET = "x".repeat(64);
const NOW = "2026-11-26T08:00:00Z"; // jeudi 26/11/2026, 9 h à Bruxelles
const SESSION = "2026-12-10-vca-base-charleroi";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EMAILJS = {
  EMAILJS_SERVICE_ID: "service_x",
  EMAILJS_TEMPLATE_CLIENT: "template_client",
  EMAILJS_TEMPLATE_EQUIPE: "template_equipe",
  EMAILJS_PUBLIC_KEY: "public_x",
  EMAILJS_PRIVATE_KEY: "private_x",
};

function sheetGas(opts = {}) {
  const answers = [];
  const G = loadGas("apps-script/reservations.gs", {
    now: NOW,
    ...opts,
    answers,
    props: { RESERVATIONS_HMAC_SECRET: SECRET, ...EMAILJS, ...(opts.props || {}) },
  });
  G.ctx.FORMATIONS = [
    ["vca-base", "VCA Base", "vca", 250, "1 jour (8 h)", 10, true],
    ["ba4", "BA4 – personnel averti", "electricite", 275, "1 jour", null, true],
    ["harnais", "Harnais et travail en hauteur", "equipements", null, "", null, true],
  ];
  G.ctx.SEED_SESSIONS = opts.seed || [
    { training: "vca-base", date: "2026-12-10", start: "08:30", end: "17:00", location: "charleroi", capacity: 10, language: "fr" },
    { training: "ba4", date: "2026-12-07", start: "08:30", end: "16:30", location: "engis", language: "fr" },
  ];
  G.ctx.install();
  G.alerts.length = 0;
  answers.push(...(opts.answers || []));
  return G;
}
let seq = 0;
function order(quantity, extra = {}) {
  seq++;
  return {
    action: "book",
    requestId: "test-request-" + String(seq).padStart(6, "0"),
    userId: USER,
    lang: "fr",
    payMode: "online",
    vatRate: 0.21,
    customer: { firstName: "Marie", lastName: "Dupont", email: `client${seq}@exemple.be`, phone: "0470 00 00 00" },
    billing: { type: "individual", street: "Rue de l'Exemple 1", zip: "4000", city: "Liège", country: "BE" },
    items: [{ training: "vca-base", sessionId: SESSION, quantity, participants: [{ firstName: "Jean", lastName: "Peeters" }] }],
    ...extra,
  };
}
const session = (G) => G.get().sessions.find((s) => s.id === SESSION);
const bookings = (G) => G.sheet("Réservations").records();
const plain = (x) => JSON.parse(JSON.stringify(x));

/* ------------------------------------------------------------------ installation */
test("installer : 9 onglets, formations, sessions du catalogue (sans capacité = non publiée), tâche automatique, idempotent", () => {
  const G = sheetGas();
  assert.deepEqual(
    G.sheets.map((s) => s.getName()),
    ["Formations", "Sessions", "Réservations", "Participants", "Demandes", "Paiements", "Profils", "File d'envoi", "Journal"],
  );
  const f = G.sheet("Formations").records();
  assert.deepEqual(plain(f.map((r) => r["Identifiant"])), ["vca-base", "ba4", "harnais"]);
  assert.equal(f[0]["Prix HTVA (€)"], 250);
  assert.equal(f[2]["Prix HTVA (€)"], "", "aucun prix inventé : vide = sur devis");
  const s = G.sheet("Sessions").records();
  assert.equal(s.length, 2);
  assert.equal(s[0]["Identifiant"], SESSION);
  assert.equal(s[0]["Lieu"], "Charleroi");
  assert.equal(s[0]["Places (total)"], 10);
  assert.equal(s[0]["Publiée sur le site"], true);
  assert.equal(s[1]["Places (total)"], "", "capacité inconnue : laissée vide");
  assert.equal(s[1]["Publiée sur le site"], false, "une session sans capacité n'est jamais publiée");
  assert.equal(G.triggers.length, 1);
  assert.equal(G.triggers[0].fn, "tick");
  G.ctx.install();
  assert.equal(G.sheet("Sessions").records().length, 2, "réinstaller ne duplique rien");
  assert.equal(G.sheet("Formations").records().length, 3);
  assert.equal(G.triggers.length, 1);
});

/* ------------------------------------------------------------------ signature */
test("sécurité : appels non signés, signature fausse, périmée ou rejouée → refusés ; rien n'est écrit", () => {
  const G = sheetGas();
  const payload = JSON.stringify(order(1));
  assert.equal(G.post(null, { payload }).status, "unauthorized", "sans signature");
  assert.equal(G.post(null, { ts: 0, nonce: "n".repeat(20), sig: "a".repeat(64), payload }).reason, "expired");
  const now = Math.floor(new Date(NOW).getTime() / 1000);
  assert.equal(G.post(null, { ts: now, nonce: "n".repeat(20), sig: "b".repeat(64), payload }).reason, "bad_signature");
  const old = G.sign(payload, now - 301);
  assert.equal(G.post(null, { ...old, payload }).reason, "expired", "plus de 5 minutes d'écart");
  const ok = G.sign(payload);
  assert.equal(G.post(null, { ...ok, payload }).status, "ok");
  assert.equal(G.post(null, { ...ok, payload }).reason, "replayed", "un nonce ne sert qu'une fois");
  const tampered = payload.replace('"quantity":1', '"quantity":9');
  const ok2 = G.sign(payload);
  assert.equal(G.post(null, { ...ok2, payload: tampered }).reason, "bad_signature", "contenu modifié après signature");
  assert.equal(bookings(G).length, 1, "seule la demande correctement signée est enregistrée");
  const getNoSig = JSON.parse(G.ctx.doGet({ parameter: { action: "sessions" } }).text);
  assert.equal(getNoSig.status, "unauthorized", "la lecture exige aussi une signature");
  const G2 = loadGas("apps-script/reservations.gs", { now: NOW, props: {} });
  assert.equal(JSON.parse(G2.ctx.doGet({ parameter: { action: "sessions", ts: "1", nonce: "n".repeat(20), sig: "c".repeat(64) } }).text).reason, "not_configured");
});

/* ------------------------------------------------------------------ liste publique */
test("liste publique : « 10 sur 10 », prix de l'onglet Formations, clôture 48 h avant, AUCUNE donnée personnelle", () => {
  const G = sheetGas();
  const out = G.get();
  assert.equal(out.status, "ok");
  assert.deepEqual(plain(out.sessions), [
    {
      id: SESSION, training: "vca-base", date: "2026-12-10", endDate: null, startTime: "08:30", endTime: "17:00",
      location: "charleroi", language: "fr", capacity: 10, seatsLeft: 10, status: "open", closesAt: "2026-12-08T08:30", price: 250,
    },
  ]);
  G.post(order(2));
  const text = JSON.stringify(G.get());
  assert.doesNotMatch(text, /Dupont|exemple\.be|0470|Peeters|Rue de/, "jamais un nom, un e-mail, un téléphone ou une adresse");
  assert.equal(G.get("health").status, "ok");
  assert.equal(G.get("autre").status, "error");
});

/* ------------------------------------------------------------------ réservations successives */
test("réservations successives : 10 → 9 → 8 ; entreprise 4 places → 4 ; refus de 5 ; complète à 0 ; jamais au-delà", () => {
  const G = sheetGas();
  let r = G.post(order(1));
  assert.equal(r.status, "ok");
  assert.match(r.reference, /^CFS-2026-[A-Z2-9]{5}$/);
  assert.equal(r.items[0].status, "pending_payment");
  assert.deepEqual(plain(r.amounts), { exclCents: 25000, vatCents: 5250, inclCents: 30250, vatRate: 0.21 });
  assert.equal(session(G).seatsLeft, 9);
  G.post(order(1));
  assert.equal(session(G).seatsLeft, 8);
  r = G.post(order(4, { payMode: "invoice", billing: { type: "company", company: "Chantiers SA", vat: "BE0403.170.701", street: "Rue 1", zip: "4480", city: "Engis" } }));
  assert.equal(r.status, "ok");
  assert.equal(r.items[0].status, "pending_invoice");
  assert.equal(session(G).seatsLeft, 4);
  r = G.post(order(5));
  assert.deepEqual(plain(r), { status: "unavailable", problems: [{ sessionId: SESSION, reason: "insufficient", remaining: 4 }] });
  assert.equal(bookings(G).length, 3, "rien n'est écrit quand la demande est refusée");
  assert.equal(G.post(order(4)).status, "ok");
  assert.equal(session(G).seatsLeft, 0);
  assert.equal(session(G).status, "full");
  assert.deepEqual(plain(G.post(order(1))), { status: "unavailable", problems: [{ sessionId: SESSION, reason: "full", remaining: 0 }] });
  const s = G.sheet("Sessions").records()[0];
  assert.equal(s["Réservées"], 10);
  assert.equal(s["Restantes"], 0);
  assert.equal(bookings(G).reduce((n, b) => n + b["Places"], 0), 10, "total réservé = capacité, jamais plus");
});

test("dernière place disputée : deux demandes → une seule réussit", () => {
  const G = sheetGas();
  G.post(order(9));
  const a = G.post(order(1));
  const b = G.post(order(1));
  assert.equal([a, b].filter((x) => x.status === "ok").length, 1);
  assert.equal(b.status, "unavailable");
  assert.equal(b.problems[0].reason, "full");
  assert.ok(G.stats().flushes >= 2, "chaque réservation est écrite (flush) avant de rendre le verrou");
});

test("lecture SOUS verrou : une réservation écrite par une autre exécution pendant l'attente du verrou est prise en compte", () => {
  let inject = false;
  const G = sheetGas({
    onLock: (api) => {
      if (!inject) return;
      inject = false;
      const t = api.sheet("Réservations");
      const head = t.getRange(1, 1, 1, t.getLastColumn()).getValues()[0];
      const row = head.map((h) => ({ Session: SESSION, Places: 9, Statut: "Confirmée", Référence: "CFS-2026-AUTRE", Formation: "VCA Base" })[h] ?? "");
      t.getRange(t.getLastRow() + 1, 1, 1, head.length).setValues([row]);
    },
  });
  assert.equal(session(G).seatsLeft, 10);
  inject = true;
  const r = G.post(order(2));
  assert.deepEqual(plain(r), { status: "unavailable", problems: [{ sessionId: SESSION, reason: "insufficient", remaining: 1 }] });
});

test("double envoi : le même requestId renvoie la même référence, sans seconde ligne", () => {
  const G = sheetGas();
  const o = order(2);
  const a = G.post(o);
  const b = G.post(o);
  assert.equal(b.status, "ok");
  assert.equal(b.duplicate, true);
  assert.equal(b.reference, a.reference);
  assert.equal(bookings(G).length, 1);
  assert.equal(session(G).seatsLeft, 8);
});

test("tout ou rien : une demande pour deux sessions est refusée en entier si l'une manque de places", () => {
  const G = sheetGas({
    seed: [
      { training: "vca-base", date: "2026-12-10", start: "08:30", end: "17:00", location: "charleroi", capacity: 10 },
      { training: "ba4", date: "2026-12-07", start: "08:30", end: "16:30", location: "engis", capacity: 2 },
    ],
  });
  const r = G.post(order(1, { items: [
    { training: "vca-base", sessionId: SESSION, quantity: 3 },
    { training: "ba4", sessionId: "2026-12-07-ba4-engis", quantity: 3 },
  ] }));
  assert.equal(r.status, "unavailable");
  assert.deepEqual(plain(r.problems), [{ sessionId: "2026-12-07-ba4-engis", reason: "insufficient", remaining: 2 }]);
  assert.equal(bookings(G).length, 0, "aucune ligne écrite, même pour la session qui avait des places");
  assert.equal(session(G).seatsLeft, 10);
});

test("clôture : les inscriptions en ligne ferment 48 h avant le début (colonne « Fin des inscriptions » pour une autre échéance)", () => {
  const G = sheetGas({ now: "2026-12-08T07:31:00Z" }); // 08:31 à Bruxelles, le 8/12 : 48 h avant le 10/12 08:30
  assert.equal(session(G).status, "closed");
  const r = G.post(order(1));
  assert.equal(r.problems[0].reason, "closed");
  const t = G.ctx.table_("Sessions");
  G.ctx.setCell_(t, 2, "closes", "09/12/2026 18:00");
  G.ctx.onEdit({ range: G.sheet("Sessions").getRange(2, 1) });
  assert.equal(session(G).status, "open", "échéance repoussée à la main");
});

test("validation : utilisateur, TVA belge (modulo 97), paiement sur facture réservé aux sociétés, paiement en ligne impossible sans prix", () => {
  const G = sheetGas({
    seed: [{ training: "harnais", date: "2026-12-12", start: "08:30", end: "16:00", location: "engis", capacity: 8 }],
  });
  assert.equal(G.post(order(1, { userId: "pas-un-uuid" })).fields.userId, "invalid");
  assert.equal(G.post(order(1, { payMode: "invoice" })).fields.payMode, "invoice_needs_vat");
  const bad = G.post(order(1, { payMode: "invoice", billing: { type: "company", company: "X", vat: "BE0403170702", street: "a", zip: "1", city: "b" } }));
  assert.equal(bad.fields.vat, "invalid", "chiffre de contrôle faux");
  const r = G.post(order(1, { items: [{ training: "harnais", sessionId: "2026-12-12-harnais-engis", quantity: 1 }] }));
  assert.equal(r.fields.payMode, "online_unavailable", "« Sur devis » : pas de paiement en ligne");
  const inv = G.post(order(1, {
    payMode: "invoice",
    billing: { type: "company", company: "X", vat: "0403 170 701", street: "a", zip: "1", city: "b" },
    items: [{ training: "harnais", sessionId: "2026-12-12-harnais-engis", quantity: 1 }],
  }));
  assert.equal(inv.status, "ok", "sur facture : places bloquées, devis envoyé par l'équipe");
  assert.equal(inv.amounts, null, "aucun montant inventé pour une formation sur devis");
  assert.equal(bookings(G)[0]["N° de TVA"], "BE0403170701", "TVA normalisée");
});

/* ------------------------------------------------------------------ paiement */
test("paiement en ligne : expiration après 30 minutes → places libérées ; paiement tardif avec places → confirmé", () => {
  let now = new Date(NOW);
  const G = sheetGas({ now: () => now });
  const r = G.post(order(3));
  assert.equal(G.post({ action: "attachPayment", ref: r.reference, mollieId: "tr_abc12345" }).status, "ok");
  assert.equal(session(G).seatsLeft, 7);
  now = new Date(now.getTime() + 31 * 60000);
  assert.equal(session(G).seatsLeft, 10, "une réservation en attente expirée ne compte plus");
  G.ctx.tick();
  assert.equal(bookings(G)[0]["Statut"], "Expirée");
  assert.equal(bookings(G)[0]["Statut du paiement"], "Expiré");
  const c = G.post({ action: "confirmPayment", ref: r.reference, mollieId: "tr_abc12345", amountCents: 90750, method: "bancontact" });
  assert.equal(c.status, "ok");
  assert.equal(c.confirmed, true, "places encore libres : la réservation est confirmée");
  assert.equal(bookings(G)[0]["Statut"], "Confirmée");
  assert.equal(session(G).seatsLeft, 7);
});

test("paiement confirmé deux fois = une seule confirmation (webhook rejoué) ; mauvais montant ou autre paiement refusés", () => {
  const G = sheetGas();
  const r = G.post(order(2));
  G.post({ action: "attachPayment", ref: r.reference, mollieId: "tr_pay00001" });
  assert.equal(G.post({ action: "confirmPayment", ref: r.reference, mollieId: "tr_pay00001", amountCents: 100 }).status, "amount_mismatch");
  assert.equal(G.post({ action: "confirmPayment", ref: r.reference, mollieId: "tr_other999", amountCents: 60500 }).status, "mismatch");
  const a = G.post({ action: "confirmPayment", ref: r.reference, mollieId: "tr_pay00001", amountCents: 60500, method: "creditcard" });
  const b = G.post({ action: "confirmPayment", ref: r.reference, mollieId: "tr_pay00001", amountCents: 60500, method: "creditcard" });
  assert.equal(a.already, false);
  assert.equal(a.confirmed, true);
  assert.equal(a.booking.lang, "fr");
  assert.equal(b.already, true, "second appel : rien de plus");
  assert.equal(G.sheet("Paiements").records().filter((p) => p["Statut"] === "Payé").length, 1, "un seul paiement enregistré comme payé");
  assert.equal(bookings(G)[0]["Statut du paiement"], "Payé");
});

test("paiement arrivé après expiration ET places reprises : pas de surréservation, « Remboursement à faire » + alerte équipe", () => {
  let now = new Date(NOW);
  const G = sheetGas({ now: () => now });
  const r = G.post(order(6));
  G.post({ action: "attachPayment", ref: r.reference, mollieId: "tr_late0001" });
  now = new Date(now.getTime() + 40 * 60000);
  assert.equal(G.post(order(8)).status, "ok", "les places libérées ont été reprises");
  const c = G.post({ action: "confirmPayment", ref: r.reference, mollieId: "tr_late0001", amountCents: 181500 });
  assert.equal(c.confirmed, false);
  assert.equal(c.conflict, true);
  assert.equal(session(G).seatsLeft, 2, "jamais au-delà de la capacité");
  assert.equal(bookings(G)[0]["Statut du paiement"], "Remboursement à faire");
  assert.ok(G.sheet("File d'envoi").records().some((m) => /Remboursement à faire/.test(m["Objet"])), "l'équipe est prévenue");
});

test("paiement échoué : expire libère les places (idempotent) ; paymentInfo ne révèle aucune donnée personnelle", () => {
  const G = sheetGas();
  const r = G.post(order(2));
  G.post({ action: "attachPayment", ref: r.reference, mollieId: "tr_fail0001" });
  assert.equal(G.post({ action: "expire", ref: r.reference, mollieId: "tr_fail0001", reason: "failed" }).released, 1);
  assert.equal(G.post({ action: "expire", ref: r.reference, mollieId: "tr_fail0001", reason: "failed" }).released, 0);
  assert.equal(session(G).seatsLeft, 10);
  const info = G.post({ action: "paymentInfo", ref: r.reference });
  assert.equal(info.state, "failed");
  assert.doesNotMatch(JSON.stringify(info), /Dupont|exemple\.be|0470/);
});

/* ------------------------------------------------------------------ menu de l'équipe */
test("annulation de session (menu) : réservations annulées, e-mail à chaque client dans sa langue, remboursements signalés", () => {
  const G = sheetGas({ answers: ["YES"] });
  const a = G.post(order(2, { lang: "nl" }));
  G.post({ action: "attachPayment", ref: a.reference, mollieId: "tr_paid0001" });
  G.post({ action: "confirmPayment", ref: a.reference, mollieId: "tr_paid0001", amountCents: 60500 });
  G.post(order(1, { payMode: "invoice", billing: { type: "company", company: "Y", vat: "BE0403170701", street: "a", zip: "1", city: "b" } }));
  G.sheet("Sessions").select(2);
  G.ctx.cancelSession();
  const rows = bookings(G);
  assert.ok(rows.every((b) => b["Statut"] === "Annulée"));
  assert.equal(rows[0]["Statut du paiement"], "Remboursement à faire");
  const out = G.sheet("File d'envoi").records();
  assert.equal(out.filter((m) => m["Type"] === "Session annulée").length, 2);
  assert.ok(out.some((m) => m["Type"] === "Session annulée" && m["Langue"] === "nl"), "e-mail dans la langue de la réservation");
  assert.ok(out.some((m) => /Remboursements à faire/.test(m["Objet"])));
  assert.equal(G.get().sessions.length, 0, "une session annulée disparaît du site");
});

test("paiement sur facture : l'équipe confirme la ligne (menu) → Confirmée, e-mail au client ; expirée après 72 h sinon", () => {
  let now = new Date(NOW);
  const G = sheetGas({ now: () => now });
  const inv = { payMode: "invoice", billing: { type: "company", company: "Z", vat: "BE0403170701", street: "a", zip: "1", city: "b" } };
  G.post(order(2, inv));
  G.post(order(3, inv));
  G.sheet("Réservations").select(2);
  G.ctx.confirmInvoiceBooking();
  assert.equal(bookings(G)[0]["Statut"], "Confirmée");
  assert.equal(bookings(G)[0]["Statut du paiement"], "Facture à émettre");
  assert.ok(G.sheet("File d'envoi").records().some((m) => m["Type"] === "Confirmation (facture)"));
  now = new Date(now.getTime() + 73 * 3600000);
  G.ctx.tick();
  assert.equal(bookings(G)[1]["Statut"], "Expirée", "non confirmée en 72 h : places libérées");
  assert.equal(session(G).seatsLeft, 8);
});

/* ------------------------------------------------------------------ comptes */
test("listForUser : un compte ne voit que SES réservations (jamais celles d'un autre)", () => {
  const G = sheetGas();
  G.post(order(1));
  G.post(order(2, { userId: OTHER, customer: { firstName: "Bob", lastName: "Autre", email: "bob@autre.be", phone: "0471 11 11 11" } }));
  const mine = G.post({ action: "listForUser", userId: USER });
  assert.equal(mine.reservations.length, 1);
  assert.doesNotMatch(JSON.stringify(mine), /bob@autre\.be|Autre/);
  assert.equal(G.post({ action: "listForUser", userId: "pas-un-uuid" }).status, "invalid");
});

test("suppression de compte : données personnelles effacées, montants et société gardés pour la comptabilité", () => {
  const G = sheetGas();
  const r = G.post(order(1, { payMode: "invoice", billing: { type: "company", company: "Compta SA", vat: "BE0403170701", street: "a", zip: "1", city: "b" } }));
  G.post({ action: "upsertProfiles", profiles: [{ id: USER, name: "Marie Dupont", email: "m@x.be", lang: "fr", created: "2026-11-01T10:00:00Z" }] });
  assert.equal(G.sheet("Profils").records().length, 1);
  G.post({ action: "anonymizeUser", userId: USER });
  const row = bookings(G)[0];
  assert.equal(row["Référence"], r.reference);
  assert.equal(row["Société"], "Compta SA");
  assert.equal(row["E-mail"], "");
  assert.equal(row["Contact"], "(compte supprimé)");
  assert.doesNotMatch(JSON.stringify(G.sheet("Participants").records()), /Peeters/);
  assert.equal(G.sheet("Profils").records().filter((p) => p["Identifiant du compte"]).length, 0);
});

test("miroir des profils : remplacé en entier à chaque synchronisation", () => {
  const G = sheetGas();
  G.post({ action: "upsertProfiles", profiles: [{ id: USER, name: "A" }, { id: OTHER, name: "B" }] });
  G.post({ action: "upsertProfiles", profiles: [{ id: OTHER, name: "B" }] });
  assert.deepEqual(plain(G.sheet("Profils").records().filter((p) => p["Identifiant du compte"]).map((p) => p["Nom"])), ["B"]);
});

test("sauvegarde hebdomadaire : profils en JSON + copie de la feuille dans un dossier Drive privé, 8 gardées", () => {
  const G = sheetGas();
  for (let i = 0; i < 10; i++) {
    G.ctx.__now = () => new Date(Date.UTC(2026, 10, 1 + i * 7, 8));
    G.post({ action: "backup", profiles: [{ id: USER }] });
  }
  const live = G.drive.files.filter((f) => !f.trashed);
  assert.equal(live.filter((f) => f.name.startsWith("profils-")).length, 8);
  assert.equal(live.filter((f) => f.name.startsWith("Sauvegarde ")).length, 8);
  assert.ok(G.created[0].sheets.some((s) => s.getName() === "Réservations"));
});

/* ------------------------------------------------------------------ demandes sans compte */
test("demandes sans compte : onglet Demandes, référence CFD, double envoi sans doublon, robot ignoré, quota P2 réservé", () => {
  const G = sheetGas();
  const body = { action: "contact", requestId: "contact-0000001", form: "devis", name: "Anne", email: "anne@pme.be", message: "Formation BA4 pour 6 personnes", consent: true, lang: "en", training: "ba4", reserveEmail: true };
  const a = G.post(body);
  assert.equal(a.status, "ok");
  assert.match(a.reference, /^CFD-2026-/);
  assert.equal(a.email.allowed, true);
  assert.equal(G.post(body).duplicate, true);
  assert.equal(G.post({ ...body, requestId: "contact-0000002", website: "spam" }).ignored, true);
  assert.equal(G.post({ ...body, requestId: "contact-0000003", consent: false }).fields.consent, "required");
  const rq = G.sheet("Demandes").records();
  assert.equal(rq.length, 1);
  assert.equal(rq[0]["Formation"], "BA4 – personnel averti");
  assert.equal(rq[0]["Langue"], "en");
});

/* ------------------------------------------------------------------ e-mails et quota */
test("quota EmailJS : P3 suspendus à 80 % (alerte unique), tout reste en file à 100 % (« Quota atteint »)", () => {
  const G = sheetGas({ props: { EMAILJS_MONTHLY_QUOTA: "10" } });
  for (let i = 0; i < 7; i++) assert.equal(G.post({ action: "countEmail", priority: "P1" }).allowed, true);
  const p3 = G.post({ action: "countEmail", priority: "P3" });
  assert.equal(p3.allowed, true, "7/10 : un rappel passe encore");
  /* 8 + l'alerte à 80 % (comptée) = 9 */
  assert.equal(G.post({ action: "countEmail", priority: "P3" }).allowed, false, "au-delà de 80 % : rappels suspendus");
  const alerts = G.sheet("File d'envoi").records().filter((m) => m["Type"] === "Alerte quota");
  assert.equal(alerts.length, 1, "une seule alerte par mois");
  assert.equal(G.post({ action: "countEmail", priority: "P1" }).allowed, true, "10/10");
  const full = G.post({ action: "countEmail", priority: "P1" });
  assert.equal(full.allowed, false);
  assert.equal(full.state, "full");
  G.post({ action: "enqueueEmail", email: { template: "client", to: "x@y.be", subject: "S", html: "<p>h</p>", text: "h", priority: "P1" } });
  G.ctx.processOutbox_(20);
  assert.ok(G.sheet("File d'envoi").records().some((m) => m["Statut"] === "Quota atteint"));
});

test("file d'envoi : EmailJS (clé privée, modèles client / équipe), 1,1 s entre deux envois, réessais sur 429 puis abandon après 5 essais", () => {
  let fail = 0;
  const G = sheetGas({ http: (url) => (url.includes("emailjs") && fail-- > 0 ? { code: 429, body: "Too Many Requests" } : { code: 200, body: "OK" }) });
  G.post({ action: "enqueueEmail", email: { template: "equipe", to: "ignored@x.be", replyTo: "client@x.be", subject: "Demande", html: "<p>x</p>", text: "x", priority: "P2" } });
  G.post({ action: "enqueueEmail", email: { template: "client", to: "client@x.be", bcc: "info@centrecfs.be", subject: "Conf", html: "<p>y</p>", text: "y", priority: "P1" } });
  assert.equal(G.ctx.processOutbox_(20), 2);
  const calls = G.http.filter((h) => h.url.includes("emailjs")).map((h) => JSON.parse(h.o.payload));
  assert.equal(calls[0].template_id, "template_equipe");
  assert.equal(calls[0].template_params.reply_to, "client@x.be");
  assert.equal(calls[0].template_params.to_email, undefined, "le destinataire du modèle équipe est fixe (écrit dans le modèle)");
  assert.equal(calls[1].template_params.to_email, "client@x.be");
  assert.equal(calls[1].accessToken, "private_x", "clé privée obligatoire");
  fail = 99;
  let now = new Date(NOW);
  G.ctx.__now = () => now;
  G.post({ action: "enqueueEmail", email: { template: "client", to: "z@x.be", subject: "Z", html: "z", text: "z", priority: "P1" } });
  for (let i = 0; i < 6; i++) {
    G.ctx.processOutbox_(20);
    now = new Date(now.getTime() + 13 * 3600000);
  }
  const z = G.sheet("File d'envoi").records().find((m) => m["Destinataire"] === "z@x.be");
  assert.equal(z["Statut"], "Échec");
  assert.equal(z["Essais"], 5);
});

test("rappel J-2 : une fois par session, P3, dans la langue du client, avec l'équipement à apporter pour les formations Équipements", () => {
  let now = new Date(NOW);
  const G = sheetGas({
    now: () => now,
    seed: [{ training: "harnais", date: "2026-12-12", start: "08:30", end: "16:00", location: "engis", capacity: 8 }],
  });
  G.post(order(1, {
    payMode: "invoice", lang: "en",
    billing: { type: "company", company: "Q", vat: "BE0403170701", street: "a", zip: "1", city: "b" },
    items: [{ training: "harnais", sessionId: "2026-12-12-harnais-engis", quantity: 1 }],
  }));
  G.sheet("Réservations").select(2);
  G.ctx.confirmInvoiceBooking();
  now = new Date("2026-12-10T08:00:00Z");
  G.ctx.tick();
  G.ctx.tick();
  const rem = G.sheet("File d'envoi").records().filter((m) => m["Type"] === "Rappel J-2");
  assert.equal(rem.length, 1);
  assert.equal(rem[0]["Priorité"], "P3");
  assert.equal(rem[0]["Langue"], "en");
});

test("concurrence : 20 réservations d'une place sur une session de 5 places → exactement 5 acceptées", () => {
  const G = sheetGas({ seed: [{ training: "vca-base", date: "2026-12-10", start: "08:30", end: "17:00", location: "charleroi", capacity: 5 }] });
  const results = Array.from({ length: 20 }, () => G.post(order(1)));
  assert.equal(results.filter((r) => r.status === "ok").length, 5);
  assert.equal(session(G).seatsLeft, 0);
});

/* ------------------------------------------------------------------ version 2.1 : sans compte, assistant, HMAC_SECRET */
test("réservation SANS compte (userId vide) acceptée, puis rattachée au compte par l'adresse vérifiée", () => {
  const G = sheetGas();
  const guest = G.post(order(1, { userId: "", customer: { firstName: "Léa", lastName: "Sans", email: "lea@exemple.be", phone: "0470 22 22 22" } }));
  assert.equal(guest.status, "ok");
  assert.equal(session(G).seatsLeft, 9, "places bloquées comme une réservation avec compte");
  // Le Worker transmet l'identifiant ET l'adresse vérifiée du compte : la réservation sans compte apparaît
  const mine = G.post({ action: "listForUser", userId: OTHER, email: "lea@exemple.be" });
  assert.equal(mine.reservations.length, 1);
  assert.equal(mine.reservations[0].ref, guest.reference);
  // Sans l'adresse, rien ; une autre adresse, rien
  assert.equal(G.post({ action: "listForUser", userId: OTHER }).reservations.length, 0);
  assert.equal(G.post({ action: "listForUser", userId: OTHER, email: "autre@exemple.be" }).reservations.length, 0);
});

test("question transmise par l'assistant : onglet Demandes, référence CFD", () => {
  const G = sheetGas();
  const r = G.post({ action: "contact", form: "assistant", requestId: "assistant-000001", lang: "nl", name: "Jan", email: "jan@exemple.be",
    message: "Is er een sessie VCA in het Nederlands?", consent: true, elapsed: 99999 });
  assert.equal(r.status, "ok");
  assert.match(r.reference, /^CFD-2026-/);
  assert.equal(G.sheet("Demandes").records()[0]["Formulaire"], "Assistant");
});

test("secret de signature sous le nom HMAC_SECRET (nom de la mission) accepté", () => {
  const G = sheetGas();
  G.props.delete("RESERVATIONS_HMAC_SECRET");
  G.props.set("HMAC_SECRET", SECRET);
  const ts = Math.floor(Date.parse(NOW) / 1000);
  const nonce = "nonce-hmac-secret-alias";
  const sig = crypto.createHmac("sha256", SECRET).update(ts + "." + nonce + ".GET:sessions").digest("hex");
  const out = JSON.parse(G.ctx.doGet({ parameter: { action: "sessions", ts: String(ts), nonce, sig } }).text);
  assert.equal(out.status, "ok");
});

test("e-mails au client (mission 7.6) : réservation sur facture reçue, paiement confirmé une seule fois ; équipe en copie cachée", () => {
  const G = sheetGas();
  const inv = G.post(order(2, {
    payMode: "invoice", lang: "nl",
    billing: { type: "company", company: "Voorbeeld BV", vat: "BE0403170701", street: "Straat 1", zip: "2000", city: "Antwerpen" },
  }));
  assert.equal(inv.status, "ok");
  const mails = () => G.sheet("File d'envoi").records();
  const facture = mails().filter((m) => m["Type"] === "Réservation (facture)");
  assert.equal(facture.length, 1);
  assert.equal(facture[0]["Copie cachée"], "info@centrecfs.be");
  assert.equal(facture[0]["Statut"], "Envoyé", "envoyé tout de suite, sans attendre la tâche automatique");
  assert.match(facture[0]["Objet"], new RegExp(inv.reference));
  assert.match(facture[0]["Objet"], /Plaatsen/, "dans la langue de la réservation");

  const paid = G.post(order(1));
  G.post({ action: "attachPayment", ref: paid.reference, mollieId: "tr_paid00001" });
  assert.equal(G.post({ action: "confirmPayment", ref: paid.reference, mollieId: "tr_paid00001", amountCents: 30250 }).confirmed, true);
  G.post({ action: "confirmPayment", ref: paid.reference, mollieId: "tr_paid00001", amountCents: 30250 });
  const recu = mails().filter((m) => m["Type"] === "Paiement reçu");
  assert.equal(recu.length, 1, "webhook rejoué : un seul e-mail");
  assert.equal(recu[0]["Copie cachée"], "info@centrecfs.be");
  assert.equal(mails().filter((m) => m["Type"] === "Réservation (facture)").length, 1, "aucun e-mail « facture » pour un paiement en ligne");
});
