-- Phase 5 migration (part 1 of 5): rename instructor_currency → personnel_currency.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000001_phase5_currency_rename.sql.
--
-- Adds a `subject_kind` discriminator column so the same table can carry
-- instructor currencies AND student currencies (Phase 5 SYL-12). A
-- backwards-compat VIEW `public.instructor_currency` is created so Phase 2
-- callers (Drizzle `instructorCurrency`, people.currencies router, RLS
-- tests) continue to work without change until they are migrated in a
-- follow-up plan.
--
-- This file ONLY does the rename + discriminator + view. Extending the
-- currency_kind enum with student kinds lives in 0015 (Postgres
-- enum-in-transaction caveat).

-- ============================================================================
-- 1. Rename table + indexes + RLS policies
-- ============================================================================
alter table public.instructor_currency rename to personnel_currency;
alter index public.instructor_currency_user_kind_idx rename to personnel_currency_user_kind_idx;
alter index public.instructor_currency_expires_idx rename to personnel_currency_expires_idx;

alter policy instructor_currency_select_own_school on public.personnel_currency
  rename to personnel_currency_select_own_school;
alter policy instructor_currency_modify_own_school on public.personnel_currency
  rename to personnel_currency_modify_own_school;

-- ============================================================================
-- 2. Add subject_kind discriminator
-- ============================================================================
alter table public.personnel_currency
  add column subject_kind text not null default 'instructor'
    check (subject_kind in ('instructor','student'));

create index personnel_currency_subject_kind_idx
  on public.personnel_currency (subject_kind, user_id, kind)
  where deleted_at is null;

-- ============================================================================
-- 3. Backwards-compat VIEW: public.instructor_currency
-- ============================================================================
create view public.instructor_currency
  with (security_invoker = true) as
  select
    id,
    school_id,
    user_id,
    kind,
    effective_at,
    expires_at,
    notes,
    document_id,
    created_at,
    updated_at,
    deleted_at
  from public.personnel_currency
  where subject_kind = 'instructor'
  with local check option;

comment on view public.instructor_currency is
  'Backwards-compat view for Phase 2 callers. Phase 5 renamed the underlying '
  'table to personnel_currency and added a subject_kind discriminator. New '
  'code should query personnel_currency directly.';
