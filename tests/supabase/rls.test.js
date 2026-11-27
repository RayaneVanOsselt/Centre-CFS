/* Migrations Supabase et RLS, exécutées dans PGlite (Postgres compilé en WebAssembly, sans serveur) en CI.
   Le schéma « auth » de Supabase est imité au strict nécessaire (auth.users, auth.uid(), auth.jwt()).
   Ce test complète supabase/tests/rls.test.sql (pgTAP), qui tourne sur la vraie base locale avec « supabase test db ».
   Sans le paquet @electric-sql/pglite (npm ci non lancé), le test est ignoré. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let PGlite = null;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  PGlite = null;
}

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const BOOTSTRAP = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`;

async function setup() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  const dir = path.join(ROOT, "supabase", "migrations");
  // Les migrations de Supabase Storage (schéma « storage ») ne s'exécutent que sur une vraie base Supabase
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql") && !x.includes("storage")).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${A}', 'a@exemple.be', '{"locale":"nl","first_name":"Anna"}'), ('${B}', 'b@exemple.be', '{"locale":"xx"}');
    insert into public.certificates (user_id, participant_name, formation_slug, issued_on) values ('${B}', 'B', 'vca-base', '2026-01-10');`);
  return db;
}

/** Exécute des requêtes avec le rôle « authenticated » et le jeton de `sub`, dans une transaction annulée. */
async function as(db, sub, fn, claims = {}) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated", aal: "aal1", ...claims })]);
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

const rejects = async (p, code) => {
  await assert.rejects(p, (e) => (code ? e.code === code : true));
};

test("profils créés à l'inscription, langue contrôlée", { skip: !PGlite && "PGlite absent (npm ci)" }, async () => {
  const db = await setup();
  const r = await db.query("select id, locale, first_name from public.profiles order by id");
  assert.deepEqual(r.rows.map((x) => [x.locale, x.first_name]), [["nl", "Anna"], ["fr", null]]);
});

test("RLS : A ne voit et ne modifie jamais les données de B", { skip: !PGlite && "PGlite absent (npm ci)" }, async () => {
  const db = await setup();
  await as(db, A, async () => {
    assert.equal((await db.query("select count(*)::int n from public.profiles")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from public.certificates")).rows[0].n, 0);
    const u = await db.query("update public.profiles set first_name = 'Pirate' where id = $1", [B]);
    assert.equal(u.affectedRows, 0);
    await rejects(db.query("insert into public.profiles (id) values ($1)", ["33333333-3333-4333-8333-333333333333"]), "42501");
  });
  await as(db, B, async () => {
    assert.equal((await db.query("select count(*)::int n from public.certificates")).rows[0].n, 1);
  });
});

test("tables techniques et rate_hit : inaccessibles aux comptes", { skip: !PGlite && "PGlite absent (npm ci)" }, async () => {
  const db = await setup();
  for (const t of ["outbox_requests", "rate_limits", "audit_log", "chat_logs"]) {
    await as(db, A, () => rejects(db.query(`select * from public.${t}`), "42501"));
  }
  await as(db, A, () => rejects(db.query("select public.rate_hit('x', 1, 60)"), "42501"));
});

test("rate_hit : limite par fenêtre (serveur)", { skip: !PGlite && "PGlite absent (npm ci)" }, async () => {
  const db = await setup();
  const hits = [];
  for (let i = 0; i < 4; i++) hits.push((await db.query("select public.rate_hit('ip:abc', 3, 3600) ok")).rows[0].ok);
  assert.deepEqual(hits, [true, true, true, false]);
});

test("sociétés : création avec TVA belge valide, visible par ses seuls gestionnaires", { skip: !PGlite && "PGlite absent (npm ci)" }, async () => {
  const db = await setup();
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A })]);
  await db.query("select public.create_company('Exemple SRL', 'BE 0417.497.106', 'Rue 1', '4000', 'Liège')");
  assert.equal((await db.query("select vat_number from public.companies")).rows[0].vat_number, "BE0417497106");
  await assert.rejects(db.query("select public.create_company('X', 'BE0123456789', 'Rue 1', '4000', 'Liège')"));
  await db.exec("rollback");

  // Sociétés persistées hors transaction pour tester B
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A })]);
  await db.query("select public.create_company('Exemple SRL', 'BE0417497106', 'Rue 1', '4000', 'Liège')");
  await db.exec("commit");
  await as(db, A, async () => assert.equal((await db.query("select count(*)::int n from public.companies")).rows[0].n, 1));
  await as(db, B, async () => {
    assert.equal((await db.query("select count(*)::int n from public.companies")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from public.company_members")).rows[0].n, 0);
  });
  assert.equal((await db.query("select account_type from public.profiles where id = $1", [A])).rows[0].account_type, "company_manager");
});

test("administrateur : lecture de tous les profils seulement avec le rôle SQL ET la double authentification", { skip: !PGlite && "PGlite absent (npm ci)" }, async () => {
  const db = await setup();
  await as(db, A, async () => assert.equal((await db.query("select count(*)::int n from public.profiles")).rows[0].n, 1), { app_metadata: { role: "admin" }, aal: "aal1" });
  await as(db, A, async () => assert.equal((await db.query("select count(*)::int n from public.profiles")).rows[0].n, 2), { app_metadata: { role: "admin" }, aal: "aal2" });
  // Un rôle « admin » dans user_metadata (modifiable par l'utilisateur) ne donne rien
  await as(db, A, async () => assert.equal((await db.query("select count(*)::int n from public.profiles")).rows[0].n, 1), { user_metadata: { role: "admin" }, aal: "aal2" });
});

test("invitation d'un second gestionnaire : acceptée seulement par l'adresse du jeton", { skip: !PGlite && "PGlite absent (npm ci)" }, async () => {
  const db = await setup();
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A, email: "a@exemple.be" })]);
  const cid = (await db.query("select public.create_company('Exemple SRL', 'BE0417497106', 'Rue 1', '4000', 'Liège') id")).rows[0].id;
  await db.exec("commit");
  // Le Worker (rôle serveur) enregistre l'invitation après avoir vérifié que A est propriétaire
  await db.query("insert into public.company_invitations (company_id, email, invited_by) values ($1, 'b@exemple.be', $2)", [cid, A]);
  // Un autre compte avec une autre adresse : rien
  await as(db, B, async () => assert.equal((await db.query("select public.accept_company_invitations() n")).rows[0].n, 0), { email: "pirate@exemple.be" });
  // B avec la bonne adresse : membre, voit la société
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: B, email: "b@exemple.be" })]);
  assert.equal((await db.query("select public.accept_company_invitations() n")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.companies")).rows[0].n, 1);
  await db.exec("commit");
  // B (gestionnaire) ne peut pas ajouter d'autres membres : seul le propriétaire le peut
  await as(db, B, () => rejects(db.query("insert into public.company_members (company_id, user_id, role) values ($1, $2, 'manager')", [cid, "33333333-3333-4333-8333-333333333333"])), { email: "b@exemple.be" });
});

test("outils admin : recherche de compte et dépôt de certificat réservés au rôle SQL + aal2", { skip: !PGlite && "PGlite absent (npm ci)" }, async () => {
  const db = await setup();
  await as(db, A, () => rejects(db.query("select public.admin_find_user('b@exemple.be')"), "42501"), { aal: "aal2" });
  await as(db, A, () => rejects(db.query("insert into public.certificates (user_id, participant_name, formation_slug, issued_on) values ($1, 'X', 'ba4', '2026-01-01')", [B]), "42501"));
  await as(db, A, async () => {
    assert.equal((await db.query("select public.admin_find_user('b@exemple.be') id")).rows[0].id, B);
    await db.query("insert into public.certificates (user_id, participant_name, formation_slug, issued_on) values ($1, 'X', 'ba4', '2026-01-01')", [B]);
  }, { app_metadata: { role: "admin" }, aal: "aal2" });
});
