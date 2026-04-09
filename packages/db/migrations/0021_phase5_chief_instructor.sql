-- Phase 5-03: chief instructor flag on user_roles.
-- Used by adminOrChiefInstructorProcedure to gate syllabus editing actions.
alter table public.user_roles
  add column if not exists is_chief_instructor boolean not null default false;
