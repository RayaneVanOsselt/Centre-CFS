-- Fichiers des certificats (PDF) : seau PRIVÉ, rangés par compte (« <user_id>/<fichier>.pdf »).
-- Lecture par liens signés de 5 minutes (espace client) ; dépôt par l'administrateur uniquement (rôle SQL + aal2).
-- (Migration propre à Supabase Storage : ignorée par le test PGlite, couverte par supabase/tests/rls.test.sql.)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy certificates_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'certificates'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
      or exists (
        select 1 from public.certificates c
        where c.file_path = name and c.company_id is not null and (select public.is_company_member(c.company_id))
      )
    )
  );

create policy certificates_files_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'certificates' and (select public.is_admin()));
create policy certificates_files_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'certificates' and (select public.is_admin()));
create policy certificates_files_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'certificates' and (select public.is_admin()));
