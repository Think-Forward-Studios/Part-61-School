-- 0001_storage_policies.sql
--
-- Phase 1 Plan 04 — Supabase Storage bucket + RLS policies for the
-- personal-document feature (FND-07).
--
-- Rationale: drizzle-kit only generates DDL for the `public` schema
-- tables declared in the Drizzle schema. The Supabase Storage schema
-- (`storage.buckets`, `storage.objects`) lives outside our Drizzle
-- world, so storage bucket creation and its RLS policies are
-- hand-authored here.
--
-- Path convention (locked in 01-RESEARCH §Pattern 8 and
-- @part61/domain's storagePath()):
--
--     school_<schoolId>/user_<userId>/<documentId>.<ext>
--
-- `storage.foldername(name)` returns the path segments as a text[]
-- *without* the leading slash, so:
--   (storage.foldername(name))[1] = 'school_<schoolId>'
--   (storage.foldername(name))[2] = 'user_<userId>'
--
-- The policies key off those segments against the caller's JWT.
--
-- Hard delete on storage.objects is intentionally NOT permitted here:
-- soft-deleted documents leave their object in place until a Phase 8
-- garbage-collection job reaps them. There is therefore no DELETE
-- policy.

begin;

-- ---------------------------------------------------------------
-- 1. Create the `documents` bucket (private, capped at 25 MiB,
--    MIME allowlist matches @part61/domain ALLOWED_MIME_TYPES).
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400, -- 25 * 1024 * 1024
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------
-- 2. RLS policies on storage.objects for the `documents` bucket.
--    storage.objects has RLS enabled by default in Supabase.
--
--    - select: any authenticated user from the same school may list
--      any object in that school's prefix. This mirrors the
--      documents table's select policy; server-side tRPC still
--      narrows to the owning user before issuing a signed URL.
--    - insert: stricter — the path must be
--      school_<jwt.school_id>/user_<auth.uid()>/... so a user cannot
--      upload into another user's folder.
--    - update: same shape as insert.
--    - delete: no policy → denied.
-- ---------------------------------------------------------------

drop policy if exists documents_select_own_school on storage.objects;
create policy documents_select_own_school on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('school_' || (auth.jwt() ->> 'school_id'))
  );

drop policy if exists documents_insert_own_school_user on storage.objects;
create policy documents_insert_own_school_user on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('school_' || (auth.jwt() ->> 'school_id'))
    and (storage.foldername(name))[2] = ('user_' || (auth.uid())::text)
  );

drop policy if exists documents_update_own_school_user on storage.objects;
create policy documents_update_own_school_user on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('school_' || (auth.jwt() ->> 'school_id'))
    and (storage.foldername(name))[2] = ('user_' || (auth.uid())::text)
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('school_' || (auth.jwt() ->> 'school_id'))
    and (storage.foldername(name))[2] = ('user_' || (auth.uid())::text)
  );

-- No delete policy: soft-delete only. A Phase 8 GC job running as
-- service_role will clean up orphaned objects.

commit;
