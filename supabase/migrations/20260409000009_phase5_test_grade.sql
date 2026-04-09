-- Phase 5-03: test_grade table (SYL-25). Mirror of packages/db/migrations/0022.
create type public.test_component_kind as enum (
  'course','stage','course_phase','unit','lesson','line_item'
);
create type public.test_kind as enum (
  'knowledge','oral','end_of_stage','practical'
);

create table public.test_grade (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  base_id uuid references public.bases(id),
  student_enrollment_id uuid not null references public.student_course_enrollment(id),
  component_kind public.test_component_kind not null,
  component_id uuid not null,
  test_kind public.test_kind not null,
  score numeric(6,2),
  max_score numeric(6,2),
  remarks text,
  signer_snapshot jsonb,
  sealed boolean not null default false,
  sealed_at timestamptz,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.test_grade enable row level security;

create policy test_grade_select on public.test_grade
  as permissive for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy test_grade_modify on public.test_grade
  as permissive for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

create or replace function public.fn_test_grade_seal_guard() returns trigger
language plpgsql as $$
begin
  if old.sealed = true then
    raise exception 'test_grade % is sealed and immutable', old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_test_grade_seal_guard
  before update on public.test_grade
  for each row execute function public.fn_test_grade_seal_guard();

create or replace function public.fn_test_grade_block_hard_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'test_grade is append-only; use deleted_at (soft-delete only)'
    using errcode = 'P0001';
end;
$$;
create trigger trg_test_grade_block_delete
  before delete on public.test_grade
  for each row execute function public.fn_test_grade_block_hard_delete();
