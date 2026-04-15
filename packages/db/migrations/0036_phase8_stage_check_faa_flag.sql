-- Phase 8 migration (part 5): stage_check FAA checkride discriminator +
-- attempt_number (IPF-03 pass rate source of truth — RESEARCH Open Q1).
--
-- Adds two columns:
--   • is_faa_checkride boolean not null default false
--   • attempt_number   int     not null default 1  (backfilled via UPDATE)
--
-- Plus a BEFORE INSERT trigger that computes attempt_number on insert
-- as the count of existing stage_check rows for the same enrollment +
-- stage with earlier scheduled_at, plus 1.
--
-- Pass-rate formula (for IPF-03 in Plan 08-03):
--   numerator   = count(*) filter (where is_faa_checkride and status='passed' and attempt_number=1)
--   denominator = count(*) filter (where is_faa_checkride and attempt_number=1)

-- ============================================================================
-- 1. Add columns (nullable initially for backfill; made NOT NULL below)
-- ============================================================================
alter table public.stage_check
  add column is_faa_checkride boolean not null default false;

alter table public.stage_check
  add column attempt_number integer;

-- ============================================================================
-- 2. Backfill attempt_number using window function
-- ============================================================================
with numbered as (
  select
    id,
    row_number() over (
      partition by student_enrollment_id, stage_id
      order by coalesce(scheduled_at, conducted_at, created_at), id
    ) as attempt_n
  from public.stage_check
  where deleted_at is null
)
update public.stage_check sc
   set attempt_number = n.attempt_n
  from numbered n
 where sc.id = n.id;

-- Any soft-deleted rows without attempt_number get 1 (they don't count
-- toward pass-rate because IPF-03 excludes deleted rows).
update public.stage_check
   set attempt_number = 1
 where attempt_number is null;

alter table public.stage_check
  alter column attempt_number set not null;

alter table public.stage_check
  alter column attempt_number set default 1;

-- ============================================================================
-- 3. Trigger to maintain attempt_number on insert
-- ============================================================================
create or replace function public.fn_stage_check_attempt_number()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(max(attempt_number), 0) + 1
      into NEW.attempt_number
      from public.stage_check
     where student_enrollment_id = NEW.student_enrollment_id
       and stage_id = NEW.stage_id
       and deleted_at is null;
    if NEW.attempt_number is null then
      NEW.attempt_number := 1;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists stage_check_attempt_number_tg on public.stage_check;

create trigger stage_check_attempt_number_tg
  before insert on public.stage_check
  for each row execute function public.fn_stage_check_attempt_number();

-- ============================================================================
-- 4. Index for IPF-03 pass-rate queries
-- ============================================================================
create index if not exists stage_check_pass_rate_idx
  on public.stage_check (school_id, checker_user_id, is_faa_checkride, attempt_number, status)
  where deleted_at is null;
