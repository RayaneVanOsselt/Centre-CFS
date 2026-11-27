-- Centre CFS : schéma Supabase (COMPTES UNIQUEMENT, mission section 16).
-- Les sessions, places, réservations, participants, paiements et demandes vivent dans la feuille Google.
-- Toutes les tables ont la RLS activée. Les tables techniques (rate_limits, outbox_requests, chat_logs, audit_log)
-- n'ont AUCUNE règle : seul le Worker (clé secrète, rôle service_role) y accède.
-- Tests : supabase/tests/rls.test.sql (pgTAP, « supabase test db ») et tests/supabase/rls.test.js (PGlite, CI).

-- ------------------------------------------------------------------ fonctions utilitaires

-- Numéro de TVA belge : BE + 0 ou 1 + 9 chiffres, contrôle modulo 97 (même règle que vat.js et reservations.gs)
create or replace function public.is_valid_be_vat(v text) returns boolean
language sql immutable set search_path = '' as $$
  select v ~ '^BE[01][0-9]{9}$' and 97 - (substr(v, 3, 8)::bigint % 97) = substr(v, 11, 2)::int
$$;

-- Administrateur : rôle posé UNIQUEMENT en SQL (app_metadata.role = 'admin') ET double authentification (aal2)
create or replace function public.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and (auth.jwt() ->> 'aal') = 'aal2', false)
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ------------------------------------------------------------------ profils

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account_type text not null default 'individual' check (account_type in ('individual', 'company_manager')),
  first_name text check (char_length(first_name) <= 80),
  last_name text check (char_length(last_name) <= 80),
  phone text check (phone ~ '^[0-9+().\/ -]{6,40}$'),
  locale text not null default 'fr' check (locale in ('fr', 'nl', 'en')),
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Profil créé automatiquement à l'inscription (langue et consentement repris des métadonnées du formulaire)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  loc text := meta ->> 'locale';
begin
  insert into public.profiles (id, first_name, last_name, locale, marketing_consent, account_type)
  values (
    new.id,
    left(nullif(meta ->> 'first_name', ''), 80),
    left(nullif(meta ->> 'last_name', ''), 80),
    case when loc in ('fr', 'nl', 'en') then loc else 'fr' end,
    coalesce((meta ->> 'marketing_consent')::boolean, false),
    case when meta ->> 'account_type' = 'company_manager' then 'company_manager' else 'individual' end
  )
  on conflict (id) do nothing;
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ sociétés

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  vat_number text unique check (vat_number is null or public.is_valid_be_vat(vat_number)),
  billing_street text check (char_length(billing_street) <= 160),
  billing_zip text check (char_length(billing_zip) <= 12),
  billing_city text check (char_length(billing_city) <= 80),
  billing_country text not null default 'BE' check (char_length(billing_country) <= 40),
  peppol_id text check (char_length(peppol_id) <= 60),
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'manager' check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user on public.company_members (user_id);

-- Appartenance (SECURITY DEFINER : évite une règle RLS récursive sur company_members)
create or replace function public.is_company_member(p_company uuid, p_owner_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company and m.user_id = (select auth.uid()) and (not p_owner_only or m.role = 'owner')
  )
$$;

-- Création d'une société : la fiche et le rôle « owner » en une seule opération
create or replace function public.create_company(p_name text, p_vat text, p_street text, p_zip text, p_city text, p_country text default 'BE')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cid uuid;
  vat text := nullif(upper(regexp_replace(coalesce(p_vat, ''), '[\s.\-]', '', 'g')), '');
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if vat is not null and vat !~ '^BE' then vat := 'BE' || vat; end if;
  if vat ~ '^BE[0-9]{9}$' then vat := 'BE0' || substr(vat, 3); end if;
  insert into public.companies (name, vat_number, billing_street, billing_zip, billing_city, billing_country)
  values (p_name, vat, p_street, p_zip, p_city, coalesce(nullif(p_country, ''), 'BE'))
  returning id into cid;
  insert into public.company_members (company_id, user_id, role) values (cid, uid, 'owner');
  update public.profiles set account_type = 'company_manager' where id = uid;
  return cid;
end
$$;

-- ------------------------------------------------------------------ certificats (fichiers dans le stockage privé)

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  participant_name text not null check (char_length(participant_name) between 1 and 160),
  formation_slug text not null check (formation_slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  reservation_ref text check (reservation_ref ~ '^CF[SDW]-[0-9]{4}-[A-Z2-9]{5,6}$'),
  issued_on date not null,
  valid_until date check (valid_until is null or valid_until >= issued_on),
  file_path text check (char_length(file_path) <= 300),
  created_at timestamptz not null default now()
);
create index certificates_user on public.certificates (user_id);
create index certificates_company on public.certificates (company_id);

-- ------------------------------------------------------------------ tables techniques (Worker uniquement)

create table public.rate_limits (
  key_hash text not null check (char_length(key_hash) <= 120),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key_hash, window_start)
);

-- Compte une requête et dit si elle est autorisée (limite p_limit par fenêtre de p_window secondes)
create or replace function public.rate_hit(p_key text, p_limit integer, p_window integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window, 1)) * greatest(p_window, 1));
  n integer;
begin
  insert into public.rate_limits as r (key_hash, window_start, count) values (left(p_key, 120), w, 1)
  on conflict (key_hash, window_start) do update set count = r.count + 1
  returning r.count into n;
  -- Ménage occasionnel (environ 1 appel sur 50) : fenêtres de plus de 2 jours
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return n <= p_limit;
end
$$;

-- Boîte de secours : demande gardée si la feuille ne répond pas, rejouée par la tâche planifiée (même requestId)
create table public.outbox_requests (
  request_id text primary key check (request_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  kind text not null check (kind in ('contact', 'registration')),
  reference text check (reference ~ '^CF[SDW]-[0-9]{4}-[A-Z2-9]{5,6}$'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text check (char_length(last_error) <= 200),
  alerted boolean not null default false
);

-- Journal du chatbot (facultatif) : question expurgée, 90 jours au plus (purge ci-dessous)
create table public.chat_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  locale text check (locale in ('fr', 'nl', 'en')),
  intent text check (char_length(intent) <= 60),
  confidence real,
  question_redacted text check (char_length(question_redacted) <= 500)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null check (char_length(action) <= 80),
  entity text check (char_length(entity) <= 60),
  entity_id text check (char_length(entity_id) <= 120),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Purges (appelées par la tâche planifiée du Worker) : journaux du chatbot après 90 jours, limites de débit anciennes
create or replace function public.purge_old_rows() returns void
language sql security definer set search_path = '' as $$
  delete from public.chat_logs where created_at < now() - interval '90 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';
$$;

-- ------------------------------------------------------------------ droits et RLS

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.certificates enable row level security;
alter table public.rate_limits enable row level security;
alter table public.outbox_requests enable row level security;
alter table public.chat_logs enable row level security;
alter table public.audit_log enable row level security;

-- Droits explicites (on ne compte pas sur les droits par défaut du projet)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, update on public.companies to authenticated;
grant select, insert, delete on public.company_members to authenticated;
grant select on public.certificates to authenticated;
grant execute on function public.is_valid_be_vat(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_company_member(uuid, boolean) to authenticated;
grant execute on function public.create_company(text, text, text, text, text, text) to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Profils : chacun le sien ; l'admin (aal2) lit tout
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Sociétés : visibles et modifiables par leurs gestionnaires (création via create_company)
create policy companies_select on public.companies for select to authenticated
  using ((select public.is_company_member(id)) or (select public.is_admin()));
create policy companies_update on public.companies for update to authenticated
  using ((select public.is_company_member(id))) with check ((select public.is_company_member(id)));

-- Membres : je vois les membres de mes sociétés ; seul le propriétaire ajoute ou retire un gestionnaire
create policy members_select on public.company_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_company_member(company_id)) or (select public.is_admin()));
create policy members_insert on public.company_members for insert to authenticated
  with check ((select public.is_company_member(company_id, true)) and role = 'manager');
create policy members_delete on public.company_members for delete to authenticated
  using ((select public.is_company_member(company_id, true)) and user_id <> (select auth.uid()));

-- Certificats : les miens, ou ceux de ma société ; écrits uniquement par le serveur
create policy certificates_select on public.certificates for select to authenticated
  using (user_id = (select auth.uid()) or (company_id is not null and (select public.is_company_member(company_id))) or (select public.is_admin()));
