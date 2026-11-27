-- Comptes : invitations d'un second gestionnaire d'entreprise, outils de l'administrateur (certificats).

-- ------------------------------------------------------------------ invitations
create table public.company_invitations (
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email ~ '^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]{2,}$' and char_length(email) <= 160),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, email)
);
alter table public.company_invitations enable row level security;
-- Aucune règle : créées par le Worker (après contrôle du propriétaire), acceptées par la fonction ci-dessous.

-- Acceptation à la connexion : l'adresse vient du jeton (vérifiée par Supabase), jamais d'un paramètre
create or replace function public.accept_company_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  n integer := 0;
begin
  if uid is null or mail = '' then return 0; end if;
  insert into public.company_members (company_id, user_id, role)
  select i.company_id, uid, 'manager' from public.company_invitations i
  where lower(i.email) = mail and i.created_at > now() - interval '30 days'
  on conflict do nothing;
  get diagnostics n = row_count;
  delete from public.company_invitations where lower(email) = mail;
  if n > 0 then
    update public.profiles set account_type = 'company_manager' where id = uid;
  end if;
  return n;
end
$$;

-- ------------------------------------------------------------------ administrateur (rôle SQL + aal2)
-- Identifiant d'un compte à partir de son adresse (dépôt d'un certificat) : réservé à l'administrateur
create or replace function public.admin_find_user(p_email text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (select id from auth.users where lower(email) = lower(p_email) limit 1);
end
$$;

create policy certificates_admin_insert on public.certificates for insert to authenticated
  with check ((select public.is_admin()));
create policy certificates_admin_update on public.certificates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy certificates_admin_delete on public.certificates for delete to authenticated
  using ((select public.is_admin()));
grant insert, update, delete on public.certificates to authenticated;

revoke all on function public.accept_company_invitations() from public, anon;
revoke all on function public.admin_find_user(text) from public, anon;
grant execute on function public.accept_company_invitations() to authenticated;
grant execute on function public.admin_find_user(text) to authenticated;
grant all on public.company_invitations to service_role;
grant execute on function public.accept_company_invitations() to service_role;
