-- Tests RLS (pgTAP) : « supabase test db » sur la base locale (Supabase CLI).
-- Règle de la phase 7 : un utilisateur A ne voit JAMAIS les données d'un utilisateur B.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Deux comptes (le déclencheur crée les profils)
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('11111111-1111-4111-8111-111111111111', 'a@exemple.be', '{"locale":"nl","first_name":"Anna"}', 'authenticated', 'authenticated'),
       ('22222222-2222-4222-8222-222222222222', 'b@exemple.be', '{"locale":"xx"}', 'authenticated', 'authenticated');

select is((select locale from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'nl', 'profil créé avec la langue du formulaire');
select is((select locale from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'fr', 'langue inconnue → fr');

insert into public.certificates (user_id, participant_name, formation_slug, issued_on, valid_until)
values ('22222222-2222-4222-8222-222222222222', 'B', 'vca-base', '2026-01-10', '2036-01-10');
insert into public.outbox_requests (request_id, kind, payload) values ('request-0001', 'contact', '{}');

-- Utilisateur A connecté
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

select is((select count(*) from public.profiles)::int, 1, 'A ne voit que son profil');
select is((select count(*) from public.certificates)::int, 0, 'A ne voit pas les certificats de B');
select throws_ok($$select * from public.outbox_requests$$, '42501', null, 'boîte de secours inaccessible');
select throws_ok($$select * from public.rate_limits$$, '42501', null, 'limites de débit inaccessibles');
select throws_ok($$select * from public.audit_log$$, '42501', null, 'journal inaccessible');
select throws_ok($$select public.rate_hit('x', 1, 60)$$, '42501', null, 'rate_hit réservé au serveur');

update public.profiles set first_name = 'Pirate' where id = '22222222-2222-4222-8222-222222222222';
select throws_ok($$insert into public.profiles (id) values ('22222222-2222-4222-8222-222222222223')$$, '42501', null, 'A ne crée pas le profil d''un autre');

-- Société de A : A la voit, B non
select lives_ok($$select public.create_company('Exemple SRL', 'BE0417497106', 'Rue 1', '4000', 'Liège')$$, 'A crée sa société');
select is((select count(*) from public.companies)::int, 1, 'A voit sa société');
select throws_ok($$select public.create_company('Mauvaise TVA', 'BE0123456789', 'Rue 1', '4000', 'Liège')$$, '23514', null, 'TVA belge invalide refusée');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.companies)::int, 0, 'B ne voit pas la société de A');

reset role;
select is((select first_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'), null, 'A n''a pas pu modifier le profil de B');

select * from finish();
rollback;
