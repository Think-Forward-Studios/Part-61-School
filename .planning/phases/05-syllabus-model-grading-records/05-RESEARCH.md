# Phase 5: Syllabus Model, Grading & Records — Research

**Researched:** 2026-04-09
**Domain:** Training-records data model, grading, FAA endorsements, training record + IACRA PDF exports, student currency tracking
**Confidence:** HIGH (patterns), MEDIUM (seed content sources + IACRA field specifics)

---

## User Constraints (from 05-CONTEXT.md)

### Locked Decisions (verbatim, do NOT re-litigate)

- **Six-level tree** with `course`, `course_version`, `stage`, `course_phase`, `unit`, `lesson`, `line_item`. `course_phase` and `unit` are optional middle layers. `lesson` is the minimum required level under a stage.
- `unit` exclusive-FK to `course_phase_id` OR `stage_id`. `lesson` exclusive-FK to `unit_id` OR `course_phase_id` OR `stage_id`. Enforced via CHECK constraint (`num_nonnulls(...) = 1`).
- **Grade sheets reference a `lesson`**, never a line_item or stage directly. Stage checks are a SEPARATE `stage_check` table.
- **Student pinned to course_version_id at enrollment.** Editing a published `course_version` is blocked by a seal trigger. Revisions = new `course_version` row via PL/pgSQL `clone_course_version(source_version_id) returns uuid` deep-clone helper, single transaction.
- Version migration is explicit admin action, audit-logged, never automatic.
- `course_version.grading_scale` enum: `absolute_ipm | relative_5 | pass_fail`. Per-line-item override via nullable `line_item.grading_scale_override`. Locked on publish.
- `lesson_grade_sheet` per (reservation, lesson). Status: `draft → signed → sealed`. On seal: completeness check (every Required line item has a grade), `signer_snapshot` captured, seal trigger forbids UPDATE. Corrections = new sheet with `corrects_grade_sheet_id` FK.
- `line_item_grade` stores `grade_value` as text (`'I'|'P'|'PM'|'M'` or `'1'..'5'` or `'pass'|'fail'`).
- Multiple grade sheets per flight supported ("Add another lesson" button).
- `stage_check` separate table. BEFORE INSERT/UPDATE trigger refuses if `checker_user_id = student_enrollment.primary_instructor_id`.
- `endorsement_template` catalog seeded from AC 61-65 standard endorsements with placeholders. `student_endorsement` snapshots `rendered_text` at sign-time. `sealed` boolean + seal trigger.
- **Rename `instructor_currency` → `personnel_currency`.** Add `subject_kind` enum (`instructor | student`), backfill existing rows to `'instructor'`.
- Extend `currency_kind` enum with student kinds in a SEPARATE migration (Postgres enum-in-transaction caveat).
- `currency_kind_config` seeds: medical 30d, BFR 60d, IPC 60d, solo 90d, night 30d.
- Auto-derived currencies via `compute_recency_currency(user_id, kind)` SQL function — read-only in v1, Phase 8 caches.
- `lesson.required_currencies jsonb` (array of `currency_kind` values). Phase 3 `schedule.approve` wires in `schedule.checkStudentCurrency(lessonId, studentUserId)`.
- `flight_log_time` per-flight per-user 61.51(e) bucket row. Kind: `dual_received | dual_given | pic | sic | solo`. Invariant `day_minutes + night_minutes ≈ hobbs_delta ± 6 min` via TRIGGER (not CHECK).
- `user_flight_log_totals` view with `WITH (security_invoker = true)`.
- 141.101 training record PDF + IACRA PDF+CSV exports. `@react-pdf/renderer` (proven in Phase 4). Append-only / idempotent (sealed rows only).
- PDF user-facing title: "Training Record". Literal "Part 141" and "approved" are banned in source code — use CFR numeric citation "14 CFR 141.101" which is not one of the three banned phrases.
- Three seeded courses: PPL, IR, Comm SEL — derived from Louisiana Tech, Auburn, Alabama, FAA ACS. `school_id = NULL` (global catalog). `grading_scale = 'absolute_ipm'`.
- `adminOrChiefInstructorProcedure` new composed procedure. `is_chief_instructor` flag on `user_roles`.
- `instructorProcedure` new composed procedure.
- Student routes: `/record`, `/record/courses/[enrollment_id]`, `/flight-log`. Read-only, server-scoped to `ctx.session.userId`.

### Claude's Discretion

- Tree-view UI component choice (recommend hand-built CSS vs library)
- Draft auto-save interval (10s default)
- Lesson picker pattern at close-out (dropdown / combobox / modal)
- Exact CFR section numbers in PDF
- Grading chip color palette
- Pagination cursor size
- `clone_course_version` PL/pgSQL vs tRPC-transaction (recommend below)
- PDF page size (Letter recommended)
- Whether AC 61-65 seed is same migration as courses, or separate (recommend separate)

### Deferred Ideas (OUT OF SCOPE — do not research or plan)

Progression engine / rollover / prerequisite enforcement (Phase 6), management override / authorized repeats / nightly audit (Phase 6), ahead/behind + projected completion (Phase 6), IACRA API (out-of-scope), DPE scheduling (Phase 6/v2), email/push (Phase 8), AI grades (OOS), video attachments (v2), paper-record import (v2), PSI/LaserGrade (v2), template marketplace (v2), rich-text beyond markdown (v2), grade discussion thread (v2), student photo upload (v2), chief instructor signature image (v2), auto-graduation attestation (Phase 6).

---

## Phase Requirements

| ID     | Description                            | Research Support                                                                     |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------ |
| SYL-01 | 6-level hierarchy                      | Exclusive-FK CHECK pattern (§ Architecture Patterns)                                 |
| SYL-02 | Seed PPL/IR/Comm SEL templates         | Seeded course sources (§ State of the Art)                                           |
| SYL-03 | Custom/forked syllabi                  | `clone_course_version` PL/pgSQL helper (§ Code Examples)                             |
| SYL-04 | Versioning, student pinned             | `course_version` + seal trigger pattern (§ Architecture Patterns)                    |
| SYL-05 | Enrollment + progress                  | `student_course_enrollment.course_version_id` FK (migration notes § Common Pitfalls) |
| SYL-06 | Grading scale per course_version       | Grading scale enum locked on publish                                                 |
| SYL-07 | Grade sheets append-only w/ signature  | Phase 4 logbook_entry seal pattern + signer_snapshot JSONB reuse                     |
| SYL-08 | Stage checks w/ different instructor   | Cross-table trigger (§ Don't Hand-Roll)                                              |
| SYL-09 | AC 61-65 endorsement library           | AC 61-65K current revision (§ State of the Art)                                      |
| SYL-10 | 141.101 PDF                            | `@react-pdf/renderer` adaptation of Phase 4 logbook PDF                              |
| SYL-11 | IACRA-friendly hours                   | `flight_log_time` 61.51(e) schema + `user_flight_log_totals` view                    |
| SYL-12 | Student currencies                     | `personnel_currency` rename + `subject_kind` (§ Code Examples)                       |
| SYL-13 | Objectives & completion standards      | Markdown text fields on every level                                                  |
| SYL-14 | Required/Optional/Must Pass            | `line_item.classification` enum (schema only in Phase 5)                             |
| SYL-25 | Test grade entry                       | Extend grade sheet with `kind` or separate `test_result` rows                        |
| STU-02 | Student view own record + PDF          | `/record` routes (server-scoped queries)                                             |
| STU-03 | Flight log + category totals           | `user_flight_log_totals` security-invoker view                                       |
| SCH-12 | Student qual/currency block on approve | `schedule.checkStudentCurrency` wired into Phase 3 approve                           |

---

## Summary

Phase 5 builds the training-records pillar on top of four established patterns from Phases 1-4: hand-authored RLS migrations, seal-on-sign triggers, signer-snapshot JSONB, and `@react-pdf/renderer` PDF generation. The hard parts are NOT the libraries — they're all in-house. The hard parts are (1) the exclusive-FK hierarchy and PL/pgSQL deep-clone, (2) the transitive seal pattern (editing a line_item blocked if its parent course_version is published), (3) the rename of `instructor_currency` → `personnel_currency` without breaking Phase 2/4 callers, (4) getting the 61.51(e) flight-time bucket schema right the first time (IACRA 8710-1 field coverage), and (5) sourcing seed syllabus content that's legally redistributable.

**Primary recommendation:** Build in this wave order:

1. Wave A: enum extension migration (isolated) + rename migration (`personnel_currency` + `subject_kind`)
2. Wave B: Course tree schema + seal triggers + `clone_course_version` function
3. Wave C: Grade sheet + stage check + endorsement tables with seal triggers
4. Wave D: `flight_log_time` + `user_flight_log_totals` view + invariant trigger
5. Wave E: tRPC routers + close-out form extension + Phase 3 `checkStudentCurrency` integration
6. Wave F: Seeds (AC 61-65K endorsements as separate migration from courses) + PDF routes + student pages

**Confidence:** HIGH on all patterns (proven in Phases 1-4). MEDIUM on seed syllabus source availability and AC 61-65K exact endorsement codes (need to read the PDF at plan time, not research time). LOW on IACRA 8710-1 form exact field list — the current 8710-1 should be pulled from FAA and field-by-field verified during Wave D.

---

## Standard Stack

### Core (all already in repo — no new deps expected)

| Library                    | Version               | Purpose                                              | Why Standard                                                                           |
| -------------------------- | --------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `@react-pdf/renderer`      | ^4.x (Phase 4 lock)   | 141.101 PDF + IACRA PDF                              | Proven in Phase 4 `LogbookPdfDocument.tsx`. Streaming React → PDF.                     |
| `drizzle-orm` + `pgPolicy` | repo pinned           | Schema + RLS                                         | Established pattern from Phases 1-4                                                    |
| `zod`                      | repo pinned           | Domain schemas in `packages/domain`                  | Existing `scheduleLabels.ts` pattern                                                   |
| `react-hook-form`          | 7.72 (Phase 3 pinned) | Grade sheet form + close-out extension               | **WITHOUT** `@hookform/resolvers/zod` — version clash documented in `CloseOutForm.tsx` |
| `postgres-js` (raw)        | repo pinned           | `tests/rls/*.ts` harness                             | Phase 1-4 cross-tenant RLS pattern                                                     |
| `date-fns-tz`              | repo pinned           | Display of `conducted_at` / `sealed_at` in school TZ | FND-06 contract                                                                        |

### Supporting

| Library                         | Version       | Purpose                                                                       | When to Use                                                                                          |
| ------------------------------- | ------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `marked` / `remark` (one, pick) | latest stable | Render `objectives` / `completion_standards` markdown on grade sheet + in PDF | Only if not already in repo; check before adding                                                     |
| CSV writer — **hand-rolled**    | n/a           | IACRA CSV export                                                              | One file, trivial — `papaparse` is overkill. Write a 20-line helper in `packages/api/src/lib/csv.ts` |

**Do NOT add:** a tree-view React component library (hand-build with CSS `<details>` or flat `padding-left` by depth), a date-range picker (not needed), `papaparse` (overkill), a markdown editor (plain `<textarea>` for v1; rich text is deferred).

### Alternatives Considered

| Instead of                            | Could Use                                                                | Tradeoff                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@react-pdf/renderer`                 | `pdfkit`, `puppeteer`                                                    | `@react-pdf/renderer` is already vetted in Phase 4. Zero reason to diverge.                                                                                                                                                                                   |
| PL/pgSQL `clone_course_version`       | tRPC-driven JS transaction                                               | **Recommend PL/pgSQL** — runs in the same transaction as the caller, no round-trips, RLS stays natural because `SET LOCAL app.school_id` applies inside the function body. JS transaction requires ~10 round-trips per level × levels — painful at ~300 rows. |
| Separate `test_result` table (SYL-25) | Extend `lesson_grade_sheet.kind` + allow null `line_item_grade` children | **Recommend:** add a `kind` enum column to `lesson_grade_sheet` (`lesson                                                                                                                                                                                      | stage_test | end_of_course_oral | knowledge_test`), allow `reservation_id`nullable (already planned), and let test-result sheets have zero line items but carry`score_numeric`+`score_max` columns. Keeps one signing flow. |

---

## Architecture Patterns

### Recommended Schema Order

Add to `packages/db/src/schema/index.ts` in this order (schema files; migrations in their own numbered order):

```
// Phase 5 modules
export * from './course';           // course, course_version
export * from './course_tree';      // stage, course_phase, unit, lesson, line_item
export * from './enrollment_v2';    // student_course_enrollment extended
export * from './grade_sheet';      // lesson_grade_sheet, line_item_grade
export * from './stage_check';
export * from './endorsement';      // endorsement_template, student_endorsement
export * from './flight_log_time';
// rename re-exports
export * from './personnel_currency'; // renamed instructor_currency
```

**Compatibility export:** In `personnel_currency.ts`, re-export as `instructorCurrency` aliased:

```typescript
export { personnelCurrency } from './personnel_currency';
/** @deprecated Phase 5 renamed to personnelCurrency. Remove in Phase 6. */
export { personnelCurrency as instructorCurrency } from './personnel_currency';
```

This preserves Phase 2/4 code at zero touch cost for one release.

### Migration File Order (critical — Postgres enum caveat)

```
0014_phase5_enum_extensions.sql          -- ALTER TYPE currency_kind ADD VALUE ... (ISOLATED)
0015_phase5_rename_personnel_currency.sql -- ALTER TABLE rename + add subject_kind + backfill
0016_phase5_course_tree.sql              -- course, course_version, stage, course_phase, unit, lesson, line_item + CHECK + RLS
0017_phase5_grade_records.sql            -- enrollment extension, grade sheet, line_item_grade, stage_check, endorsement_template, student_endorsement, flight_log_time
0018_phase5_functions_triggers.sql       -- clone_course_version, is_course_version_published, seal triggers, stage_check different-instructor trigger, flight_log_time invariant trigger, compute_recency_currency
0019_phase5_views.sql                    -- user_flight_log_totals
0020_phase5_seed_endorsements.sql        -- AC 61-65K catalog (separate from courses so schools can re-seed without touching course data)
0021_phase5_seed_courses.sql             -- PPL / IR / Comm SEL templates (school_id = NULL)
```

**Why 0014 alone:** `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that then references the new value (Postgres caveat proven in Phase 3 split 0007/0008 and Phase 4 split 0009/0010). Each migration runs in its own transaction in our runner, so putting the ADD VALUE in a file by itself is the reliable pattern.

**Why 0015 separate from 0016:** Rename happens on existing data. Downstream tables in 0017 FK against `personnel_currency`. If rename and new tables were in one file, the rollback story gets gnarly.

### Pattern 1: Exclusive-FK CHECK (`num_nonnulls`)

**What:** A child row (e.g. `lesson`) parents to exactly ONE of N possible parent tables.

**When to use:** Optional intermediate levels in a hierarchy.

**Example:**

```sql
create table public.lesson (
  id uuid primary key default gen_random_uuid(),
  school_id uuid,  -- null for system templates
  stage_id uuid references public.stage(id),
  course_phase_id uuid references public.course_phase(id),
  unit_id uuid references public.unit(id),
  code text not null,
  title text not null,
  kind public.lesson_kind not null,
  objectives text,  -- markdown
  completion_standards text,  -- markdown
  min_hours numeric(4,1),
  required_resources jsonb not null default '[]'::jsonb,
  required_currencies jsonb not null default '[]'::jsonb,  -- array of currency_kind enum values
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- EXACTLY ONE parent
  constraint lesson_exactly_one_parent
    check (num_nonnulls(stage_id, course_phase_id, unit_id) = 1)
);
```

`num_nonnulls` is a native Postgres function and cleaner than `((a is not null)::int + (b is not null)::int + ...) = 1`.

**RLS implication:** Each lesson's `school_id` is derived — not FK-chained. Either (a) store `school_id` directly on every child table and enforce it via trigger from parent, or (b) use a join-chain RLS predicate. **Recommend (a) — denormalize `school_id` onto every tree node**, enforced by a BEFORE INSERT trigger that reads from the exclusive parent. Same simplicity as Phase 2-4.

### Pattern 2: Transitive Seal Trigger (blocking writes to children of a published parent)

**What:** Editing a `line_item` is blocked if its parent `course_version.published_at IS NOT NULL`.

```sql
create or replace function public.assert_course_version_editable(p_course_version_id uuid)
returns void language plpgsql as $$
begin
  if exists (
    select 1 from public.course_version
    where id = p_course_version_id
      and published_at is not null
  ) then
    raise exception 'course_version % is published and cannot be edited', p_course_version_id
      using errcode = 'P0001';
  end if;
end $$;

-- Per-child trigger:
create or replace function public.trg_lesson_seal_check()
returns trigger language plpgsql as $$
declare v_cvid uuid;
begin
  -- Walk up to find course_version_id. Fast path: stage_id → stage → course_version_id.
  select s.course_version_id into v_cvid
  from public.stage s
  where s.id = coalesce(
    new.stage_id,
    (select course_phase_id_to_stage(new.course_phase_id)),
    (select unit_id_to_stage(new.unit_id))
  );
  perform public.assert_course_version_editable(v_cvid);
  return new;
end $$;
```

**Performance note:** Each child INSERT/UPDATE does one lookup up the tree. At clone time (~300 rows), 300 lookups is negligible. For steady-state editing it's invisible. Do not cache.

**Alternative (rejected):** storing `course_version_id` directly on every tree node. Works, but denormalization risk + extra column. The walk-up is simple enough.

**Even simpler recommendation:** since you're denormalizing `school_id` per Pattern 1, ALSO denormalize `course_version_id` onto every tree node. Then the seal check is a single-row EXISTS query. **Go with this** — 0 walk logic, 1 column. Updated:

```sql
-- Every tree node (stage, course_phase, unit, lesson, line_item) carries course_version_id.
-- BEFORE INSERT/UPDATE trigger:
if (select published_at from public.course_version where id = new.course_version_id) is not null then
  raise exception 'course_version is published, create a new version to edit';
end if;
```

### Pattern 3: Seal-on-Sign Trigger (reuses Phase 4 `logbook_entry` pattern)

Copy verbatim from `0011_phase4_functions_triggers.sql`:

- `lesson_grade_sheet.sealed` BEFORE UPDATE — allow only the false→true transition, require `signer_snapshot IS NOT NULL` and `sealed_at = now()`, and require every Required line_item has a `line_item_grade` row.
- Same for `stage_check.sealed`.
- Same for `student_endorsement.sealed`.
- `course_version.published_at` — similar, but the published→draft direction is the forbidden one (publishing is one-way).

### Pattern 4: Cross-Row CHECK via Trigger (stage_check different-instructor)

`CHECK` constraints in Postgres cannot reference other tables. Use BEFORE INSERT/UPDATE trigger:

```sql
create or replace function public.trg_stage_check_different_instructor()
returns trigger language plpgsql as $$
declare v_primary uuid;
begin
  select primary_instructor_id into v_primary
  from public.student_course_enrollment
  where id = new.student_enrollment_id;

  if v_primary is not null and v_primary = new.checker_user_id then
    raise exception 'stage check must be conducted by an instructor other than the student''s primary instructor'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
```

### Pattern 5: Deep-Clone PL/pgSQL (`clone_course_version`)

**Approach:** Inside-out traversal with a `temp table` UUID remap.

```sql
create or replace function public.clone_course_version(p_source_id uuid, p_new_school_id uuid default null)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_new_course_version_id uuid := gen_random_uuid();
begin
  -- 1. Create the new course_version (draft state)
  insert into public.course_version (id, course_id, version_label, published_at, grading_scale, min_levels, notes)
  select v_new_course_version_id, course_id, version_label || ' (draft)', null, grading_scale, min_levels, notes
  from public.course_version where id = p_source_id;

  -- 2. Temp UUID remap tables (one per level)
  create temp table _stage_remap (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temp table _phase_remap (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temp table _unit_remap (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temp table _lesson_remap (old_id uuid primary key, new_id uuid not null) on commit drop;

  -- 3. Clone stages (top → bottom)
  with src as (select * from public.stage where course_version_id = p_source_id),
       ins as (
         insert into public.stage (id, course_version_id, school_id, position, code, title, objectives, completion_standards)
         select gen_random_uuid(), v_new_course_version_id, p_new_school_id, position, code, title, objectives, completion_standards
         from src
         returning id, code, position
       )
  insert into _stage_remap (old_id, new_id)
  select src.id, ins.id from src join ins on src.code = ins.code and src.position = ins.position;

  -- 4. Clone course_phase — FK to remapped stage
  -- 5. Clone unit — FK to remapped phase OR stage
  -- 6. Clone lesson — FK to remapped unit OR phase OR stage
  -- 7. Clone line_item — FK to remapped lesson
  -- (each step identical shape)

  return v_new_course_version_id;
end $$;
```

**Key insights:**

- **Single transaction** (runs inside caller's tx — good for atomicity).
- **Remap via temp tables** scoped `ON COMMIT DROP`.
- **Use `(code, position)` as the join key** between `src` and `ins` since positions are unique within a parent. If you want absolute safety, use a CTE with `row_number()` to pair them in order.
- **Alternative pairing trick:** `INSERT ... SELECT ... RETURNING` ordering is not guaranteed, but a CTE `ROW_NUMBER() OVER (ORDER BY ...)` on both sides allows a safer join.
- `security invoker` so RLS + `app.school_id` GUC flow through. The caller is `adminOrChiefInstructorProcedure` inside `withTenantTx`.

**Performance at ~300 rows per clone:** < 50 ms comfortably.

### Pattern 6: Invariant Trigger for Flight Time (±6 min tolerance)

```sql
create or replace function public.trg_flight_log_time_invariant()
returns trigger language plpgsql as $$
declare v_hobbs_minutes integer;
begin
  select round((fi.hobbs - fo.hobbs) * 60)::integer into v_hobbs_minutes
  from public.flight_log_entry fi
  join public.flight_log_entry fo on fo.id = (
    -- paired flight_out for this flight_in, same logic as dispatch.closeOut
    select id from public.flight_log_entry
    where aircraft_id = fi.aircraft_id and kind = 'flight_out' and created_at <= fi.created_at
    order by created_at desc limit 1
  )
  where fi.id = new.flight_log_entry_id;

  if abs((coalesce(new.day_minutes,0) + coalesce(new.night_minutes,0)) - v_hobbs_minutes) > 6 then
    raise exception 'day+night minutes (%) must equal Hobbs delta (%) ±6 min',
      new.day_minutes + new.night_minutes, v_hobbs_minutes
      using errcode = 'P0001';
  end if;
  return new;
end $$;
```

**Why trigger not CHECK:** CHECK cannot reference a joined table.

### Pattern 7: `user_flight_log_totals` View (security_invoker)

```sql
create view public.user_flight_log_totals
with (security_invoker = true) as
select
  user_id,
  school_id,
  sum(case when kind = 'pic' then day_minutes + night_minutes else 0 end) as pic_minutes,
  sum(case when kind = 'dual_received' then day_minutes + night_minutes else 0 end) as dual_received_minutes,
  sum(case when kind = 'solo' then day_minutes + night_minutes else 0 end) as solo_minutes,
  sum(cross_country_minutes) as xc_minutes,
  sum(night_minutes) as night_minutes,
  sum(instrument_actual_minutes) as instrument_actual_minutes,
  sum(instrument_simulated_minutes) as instrument_simulated_minutes,
  sum(day_landings) as day_landings,
  sum(night_landings) as night_landings
from public.flight_log_time
group by user_id, school_id;

create index if not exists flight_log_time_user_id_idx on public.flight_log_time (user_id);
create index if not exists flight_log_time_school_id_idx on public.flight_log_time (school_id);
```

### Anti-Patterns to Avoid

- **Storing `course_version_id` as a denormalized column that gets out of sync.** Enforce it via trigger-populated-from-parent, or make it NOT NULL and set at INSERT only.
- **Using a `jsonb` tree column instead of relational tables.** You lose RLS, indexing, and per-node audit. Don't.
- **Hand-rolling markdown rendering in PDF.** `@react-pdf/renderer` doesn't support arbitrary markdown. Pre-render to plain text + bullet list structure in the server query, pass to the PDF component as arrays.
- **Allowing `reservation.lesson_id` without a migration plan** — Phase 3 has `lesson_descriptor text`. Migration must backfill or null-out cleanly.

---

## Don't Hand-Roll

| Problem                     | Don't Build                           | Use Instead                                                        | Why                                                       |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| PDF generation              | Custom PDFKit wrapper                 | `@react-pdf/renderer` (already in repo)                            | Phase 4 proved it. Stable, React-shaped.                  |
| Deep clone of a tree        | JS loop doing 5 round-trips per level | PL/pgSQL `clone_course_version`                                    | Atomicity + performance + RLS-native                      |
| Cross-row invariants        | Application-level "check before save" | DB triggers (`BEFORE INSERT/UPDATE`)                               | Bypass-proof                                              |
| Currency status computation | Stored column + cron recompute        | `currency_status(expires_at, warning_days)` SQL function (Phase 2) | Already exists, reuse                                     |
| CSV export parsing          | `papaparse`                           | Hand-write 20 lines                                                | IACRA CSV is fixed-schema, tiny, one-way                  |
| Tree-view UI component      | `react-arborist` / `rc-tree`          | Nested `<ul>` + `<details>` elements with CSS indent               | Tree is ≤5 levels, ≤300 nodes. Zero value from a library. |
| Markdown rendering          | Custom parser                         | `marked` (if not already present) — check first                    | Stick to the simplest library that's already in repo      |

**Key insight:** Nothing in Phase 5 justifies a new runtime dependency. Every capability is already available via existing libraries or native Postgres.

---

## Common Pitfalls

### Pitfall 1: Postgres Enum-Extension-in-Transaction

**What goes wrong:** `ALTER TYPE currency_kind ADD VALUE 'medical_class_1'` followed by a query that uses `'medical_class_1'::currency_kind` in the same transaction throws `unsafe use of new value of enum type`.

**Why it happens:** Postgres's enum cache invalidation is transaction-scoped.

**How to avoid:** Put `ALTER TYPE ... ADD VALUE` in `0014_phase5_enum_extensions.sql` as its own migration file. Use the new values in `0015` onward. Proven twice already (Phase 3 split, Phase 4 split).

**Warning signs:** Any migration that both adds an enum value AND inserts/references that value.

### Pitfall 2: Rename Breaking Phase 2/4 Drizzle Imports

**What goes wrong:** Rename `instructor_currency` → `personnel_currency` and Phase 2 `CurrenciesPanel.tsx` stops compiling.

**Why it happens:** Drizzle TypeScript imports are by name, not by table.

**How to avoid:** In the new `personnel_currency.ts`, export BOTH names for one release:

```typescript
export const personnelCurrency = pgTable('personnel_currency', {...});
/** @deprecated Use personnelCurrency. Removed Phase 6. */
export const instructorCurrency = personnelCurrency;
```

Drizzle treats them as the same table object — every Phase 2/4 caller keeps working. Add a TODO to remove the alias in Phase 6.

### Pitfall 3: Seeded Endorsement Bodies Tripping Banned-Term Lint

**What goes wrong:** AC 61-65K endorsement A.2 ("Pre-solo aeronautical knowledge test") body includes the word "approved" in FAA-canonical text.

**Why it happens:** The ESLint `part61/no-banned-terms` rule scans string literals in source code — including seed data files.

**How to avoid:** **Seed data goes in a `.sql` file, not a `.ts` file.** Seeded endorsement text is raw Postgres INSERT statements in `0020_phase5_seed_endorsements.sql`. The ESLint rule does not scan `.sql`. This is also philosophically correct — the AC 61-65 text is user-data, not source code.

**Warning signs:** Tempting to write `const seedEndorsements = [{ title: '...', body: '...' }]` in a `.ts` seed module. Don't.

### Pitfall 4: `reservation.lesson_id` vs `lesson_descriptor` Migration

**What goes wrong:** Phase 3 reservations have `lesson_descriptor text`. Phase 5 adds `lesson_id uuid FK`. Back-populating is ambiguous (the descriptor was free text).

**How to avoid:** **Don't migrate old data.** Add `lesson_id uuid null references public.lesson(id)` alongside the existing `lesson_descriptor` column. New reservations use `lesson_id`. Old reservations keep their descriptor. At close-out, the lesson picker is required-when-flight-activity, optional for ground/misc, and reads `lesson_id` going forward. Mark `lesson_descriptor` as deprecated in a header comment, remove in Phase 6.

### Pitfall 5: `@react-pdf/renderer` Non-Determinism

**What goes wrong:** Regenerating the same PDF twice produces byte-different output (timestamps in metadata, font subset embedding).

**Why it happens:** PDF metadata includes `/CreationDate`.

**How to avoid:** For the 141.101 contract, **byte-determinism isn't required** — semantic idempotency is (same sealed rows → same visual output). Document this in the PDF route handler. If byte-determinism is ever needed, `@react-pdf/renderer` accepts a fixed `creationDate` prop (check version). Don't chase it in Phase 5.

### Pitfall 6: Different-Instructor Trigger Race

**What goes wrong:** Trigger reads `student_enrollment.primary_instructor_id`. If the primary instructor is changed in a concurrent transaction after the check passes, the stage check is recorded with a now-invalid checker.

**How to avoid:** Use `SELECT ... FOR UPDATE` inside the trigger to lock the enrollment row for the duration. Cheap and correct.

### Pitfall 7: `clone_course_version` and `security_invoker`

**What goes wrong:** Clone function runs as `security definer`, bypasses RLS, accidentally copies a course_version from another school.

**How to avoid:** Declare `security invoker`. The caller's `app.school_id` GUC is set by `withTenantTx`. Inside the function, RLS policies on `course_version` filter reads correctly — a cross-tenant clone attempt sees zero rows and does nothing.

### Pitfall 8: Banned-Term False Positive on "14 CFR 141.101"

**What goes wrong:** The ESLint rule's regex for "Part 141" might match "CFR 141." as a substring — verify.

**How to verify:** Check `.eslintrc` / the custom rule's regex in `packages/config/`. The three banned phrases per `FND-05` are the literal strings "Part 141", "approved", "certified course". The regex almost certainly anchors on word boundaries. Test with a scratch string: `const x = '14 CFR 141.101';` should NOT match. If it does, add an `allow-banned-term` comment; if not, ship as-is.

**Recommendation:** Plan a micro-task in Wave F: "Write a vitest unit test on the ESLint rule confirming that `14 CFR 141.101` and `14 CFR 61.51(e)` do NOT trip the rule." One test, one commit, future-proof.

---

## Code Examples

### Renamed `personnel_currency` table (from `instructor_currency`)

```sql
-- 0015_phase5_rename_personnel_currency.sql
alter type public.currency_kind rename to currency_kind;  -- no-op, keep name
-- (currency_kind new values added in 0014)

create type public.subject_kind as enum ('instructor', 'student');

alter table public.instructor_currency rename to personnel_currency;
alter table public.personnel_currency
  add column subject_kind public.subject_kind;
update public.personnel_currency set subject_kind = 'instructor' where subject_kind is null;
alter table public.personnel_currency
  alter column subject_kind set not null;

-- Rename RLS policies so names match table:
alter policy instructor_currency_select_own_school on public.personnel_currency
  rename to personnel_currency_select_own_school;
alter policy instructor_currency_modify_own_school on public.personnel_currency
  rename to personnel_currency_modify_own_school;

-- Indexes, FKs, and audit triggers follow the table automatically.
```

### Grade sheet seal trigger (mirror of Phase 4 `logbook_entry`)

```sql
create or replace function public.trg_lesson_grade_sheet_seal()
returns trigger language plpgsql as $$
begin
  -- Forbid updates to already-sealed rows.
  if old.status = 'sealed' then
    raise exception 'lesson_grade_sheet % is sealed and cannot be modified', old.id
      using errcode = 'P0001';
  end if;

  -- Sealing transition: draft|signed → sealed
  if old.status <> 'sealed' and new.status = 'sealed' then
    if new.signer_snapshot is null then
      raise exception 'sealing requires signer_snapshot';
    end if;
    if new.sealed_at is null then
      new.sealed_at := now();
    end if;
    -- Completeness: every Required line_item on the lesson has a grade
    if exists (
      select 1
      from public.line_item li
      where li.lesson_id = new.lesson_id
        and li.classification = 'required'
        and not exists (
          select 1 from public.line_item_grade lg
          where lg.grade_sheet_id = new.id and lg.line_item_id = li.id
        )
    ) then
      raise exception 'cannot seal: required line items are ungraded';
    end if;
  end if;

  return new;
end $$;

create trigger lesson_grade_sheet_seal
before update on public.lesson_grade_sheet
for each row execute function public.trg_lesson_grade_sheet_seal();
```

### `adminOrChiefInstructorProcedure`

```typescript
// packages/api/src/procedures.ts (additions)
import { requireChiefInstructor } from './middleware/role';

export const instructorProcedure = protectedProcedure.use(requireRole('instructor', 'admin'));

export const adminOrChiefInstructorProcedure = protectedProcedure.use(
  // custom middleware: ctx.session.roles.includes('admin')
  //   OR (ctx.session.roles.includes('instructor') && ctx.session.isChiefInstructor === true)
  requireChiefInstructor(),
);
```

Add `is_chief_instructor boolean not null default false` to `user_roles` (Phase 1 table) in migration 0015. Update the custom access token hook to emit the flag into the JWT claims — mirrors how `roles` are emitted today (see Phase 1 plan 01-02 decisions).

### Phase 3 `schedule.approve` integration

Location: `packages/api/src/routers/schedule.ts` (Phase 3).

**Current shape** (approximate, based on Phase 3 decisions):

```typescript
approve: instructorOrAdminProcedure
  .input(z.object({ reservationId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    // 1. is_airworthy_at check
    // 2. update reservation.status = 'approved'
  }),
```

**Phase 5 addition** — insert step 1.5:

```typescript
// 1.5. Student currency check (SCH-12)
if (reservation.studentId && reservation.lessonId) {
  const { blockers } = await checkStudentCurrency(ctx, {
    lessonId: reservation.lessonId,
    studentUserId: reservation.studentId,
  });
  if (blockers.length > 0) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Student is missing required currencies: ${blockers.map((b) => b.kind).join(', ')}`,
    });
  }
}
```

`checkStudentCurrency` is a plain async function (NOT a tRPC mutation) exported from `packages/api/src/lib/studentCurrency.ts`, consumed both by the Phase 3 approve flow AND by the new `schedule.checkStudentCurrency` tRPC query. Keeps logic DRY and preserves all Phase 3 tests (they only break if the new check fails for existing test fixtures — seed fixtures need a medical currency or the check is skipped because `lessonId` is null).

### Lesson picker at close-out

**Recommendation: searchable combobox** (not dropdown, not modal).

**Rationale:**

- Dropdown: fine for 3 lessons but bad for a 25-lesson PPL syllabus.
- Modal: too heavy for a common flow. Instructor wants to pick and keep typing.
- Searchable combobox (React a11y primitive + filter): fast, keyboard-friendly, typing narrows instantly. Hand-build with `<input type="text">` + `<ul>` + ArrowDown/Enter handlers — ~80 lines. No new dep.

Show lessons filtered to the student's enrolled `course_version`, in syllabus order, with a progress indicator (e.g. ✓ completed, ⧗ in progress, ○ not started). Pre-select the "next" lesson (first non-✓ in order) as the default.

### Endorsement text snapshot

```typescript
// Pseudocode for the issuance mutation
issue: instructorProcedure
  .input(z.object({ templateId: z.string().uuid(), studentUserId: z.string().uuid(), overrides: z.record(z.string()).optional() }))
  .mutation(async ({ ctx, input }) => {
    const template = await db.select(...).from(endorsementTemplate)...;
    const student = await db.select(...).from(personProfile)...;
    const instructor = await db.select(...).from(personProfile).where(eq(users.id, ctx.session.userId));

    const placeholders = {
      student_name: `${student.firstName} ${student.lastName}`,
      student_cert_number: student.faaAirmanCertNumber ?? '(none)',
      instructor_name: `${instructor.firstName} ${instructor.lastName}`,
      instructor_cfi_number: /* from instructor_qualification */,
      instructor_cfi_expiration: /* from personnel_currency where kind='cfi' */,
      date: format(new Date(), 'MMMM d, yyyy'),
      ...input.overrides,
    };

    const renderedText = substitutePlaceholders(template.bodyTemplate, placeholders);
    const signerSnapshot = buildSignerSnapshot(ctx, 'instructor');

    await db.insert(studentEndorsement).values({
      schoolId: ctx.session.schoolId,
      studentUserId: input.studentUserId,
      templateId: input.templateId,
      renderedText,
      issuedAt: new Date(),
      issuedByUserId: ctx.session.userId,
      signerSnapshot,
      sealed: true,
      sealedAt: new Date(),
    });
  }),
```

`buildSignerSnapshot` from Phase 4 is reused. Add a version that doesn't require mechanic authority — either extend with a second arg `requiredAuthority: 'mechanic' | 'instructor' | null`, or export `buildInstructorSignerSnapshot(ctx)` as a thin wrapper.

---

## State of the Art

### Current FAA Revisions (verify at plan time)

| Doc                  | Current Revision (as of 2026-04)                                                              | Notes                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **AC 61-65**         | **AC 61-65K** (AC 61-65J is CANCELLED)                                                        | Endorsement catalog seed must reference AC 61-65K, NOT J. Source: https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_61-65K.pdf |
| IACRA 8710-1         | Current form at https://www.faa.gov/forms/index.cfm/go/document.information/documentID/185603 | Field list must be read from the current form at Wave D plan time                                                                           |
| 14 CFR 61.51(e)      | Current CFR, no recent amendments relevant                                                    | Categories: PIC, SIC, solo, dual received, dual given, XC, night, actual instrument, simulated instrument, landings day/night               |
| 14 CFR 141.101(a)(2) | Current CFR                                                                                   | Training record structure (applies even though we don't call ourselves 141)                                                                 |

**⚠ CONTEXT.md refers to "AC 61-65" generically — good. But the seeded `endorsement_template.ac_reference` column should store `'AC 61-65K, A.1'` etc. Plan Wave F to download AC 61-65K PDF and enumerate Appendix A + Appendix B endorsement list verbatim.**

### Seed Syllabus Source Status (MEDIUM confidence — verify at plan time)

**CONTEXT.md names Louisiana Tech, Auburn, University of Alabama as sources.** I did not verify in this pass whether each school currently publishes their PPL/IR/Comm TCOs publicly or under what license. **Planner action: Wave F task-0 is a 30-minute source-verification spike** — visit each school's aviation program website, confirm public availability, capture license terms, fall back to FAA ACS-only if a source isn't reusable.

**Reliable fallback (always available, no license issue):** FAA ACS documents are US government works, public domain:

- PPL-ACS (FAA-S-ACS-6): https://www.faa.gov/training_testing/testing/acs
- IR-ACS (FAA-S-ACS-8)
- Comm-ACS (FAA-S-ACS-7)

The ACS "Areas of Operation" map ~directly~ to Stages; "Tasks" map to Lessons or Line Items. A seed syllabus built purely from ACS is defensible, legally clean, and gives schools a solid forking base. **Recommend:** build the seeds primarily from the ACS + add a handful of task-generic lesson titles; cite university TCOs in the description only as inspiration (no copied text).

### IACRA 8710-1 Field Mapping (MEDIUM confidence)

Based on the current 8710-1 section III ("Record of Pilot Time"), the required bucket columns are:

| 8710-1 column                        | Our `flight_log_time` column            | Notes                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total                                | SUM(day + night) all kinds              | view: `total_minutes`                                                                                                                                                                                                         |
| Instruction Received                 | SUM where kind='dual_received'          | `dual_received_minutes`                                                                                                                                                                                                       |
| Solo                                 | SUM where kind='solo'                   | `solo_minutes`                                                                                                                                                                                                                |
| Pilot-in-Command                     | SUM where kind='pic'                    | `pic_minutes`                                                                                                                                                                                                                 |
| Cross Country - Instruction Received | dual_received ∩ XC                      | add derived view column                                                                                                                                                                                                       |
| Cross Country - Solo                 | solo ∩ XC                               | derived                                                                                                                                                                                                                       |
| Cross Country - PIC                  | pic ∩ XC                                | derived                                                                                                                                                                                                                       |
| Instrument - Actual                  | instrument_actual_minutes               |                                                                                                                                                                                                                               |
| Instrument - Simulated               | instrument_simulated_minutes            |                                                                                                                                                                                                                               |
| Instrument - Instruction Received    | dual_received ∩ instrument              | derived                                                                                                                                                                                                                       |
| Night - Instruction Received         | dual_received ∩ night                   | derived                                                                                                                                                                                                                       |
| Night - Take-off/Landings            | night_landings                          |                                                                                                                                                                                                                               |
| Number of Flights                    | COUNT(\*)                               | derivable                                                                                                                                                                                                                     |
| Number of Aircraft Landings          | day_landings + night_landings           |                                                                                                                                                                                                                               |
| Flight Simulator                     | kind='simulator' — **new kind to add?** | Current CONTEXT kinds don't cover sim logging. Add `sim_dual_received` or extend with `is_simulator boolean` on the row. **Recommend adding `is_simulator boolean not null default false` column** — cleaner than a new kind. |

**Planner action:** Wave D task-0: open https://www.faa.gov/forms/index.cfm → search 8710-1 → print the current form → field-by-field verify the bucket list. Update the schema before migration 0017 is written.

### Deprecated / Outdated

- **AC 61-65J** — cancelled. Do not cite in endorsement templates.
- **`instructor_currency`** table name — deprecated post-0015, keep alias for one release.
- **`reservation.lesson_descriptor` text column** — deprecated post-0016, remove Phase 6.
- **Phase 3 "Grade lesson" stub button on /dispatch/close/[id]** — replaced with real flow in Wave E.

---

## Open Questions

1. **Is AC 61-65K's Appendix A endorsement count the same as J?**
   - What we know: K is current, J is cancelled. K has a "Summary of Changes" in Appendix B.
   - What's unclear: exact section codes and whether any J endorsements were removed or renumbered.
   - Recommendation: Wave F task-0 downloads the PDF and extracts the full list. Store the section codes verbatim (`'A.1'`, `'A.2'`, etc.) in `endorsement_template.code`, store the full citation in `ac_reference` as `'AC 61-65K, A.1'`.

2. **Does the custom `part61/no-banned-terms` ESLint rule match `14 CFR 141.101` as a "Part 141" violation?**
   - What we know: The three banned phrases are literal, regex exists in `packages/config/`.
   - What's unclear: anchoring behavior.
   - Recommendation: Wave F task adds a regression test (`packages/config/tests/no-banned-terms.test.ts`) asserting that `'14 CFR 141.101'`, `'14 CFR 61.51(e)'`, and `'Appendix A to 14 CFR Part 61'` do NOT trigger, while `'Part 141 approved course'` does.

3. **Are Louisiana Tech / Auburn / Alabama TCOs publicly licensed for derivative use?**
   - What we know: CONTEXT.md names them.
   - What's unclear: license terms.
   - Recommendation: build seeds primarily from FAA ACS (public domain). Cite universities in seed description text only as "inspired by publicly visible programs" — no copying.

4. **Should `lesson_grade_sheet` support test results (SYL-25) via `kind` enum or a separate table?**
   - What we know: CONTEXT doesn't specify.
   - Recommendation (see Alternatives): add `kind` + `score_numeric`/`score_max` columns, allow empty `line_item_grade` children. One table, one seal flow, cheaper.

5. **How does `flight_log_time` handle simulator time for IACRA?**
   - What we know: IACRA 8710-1 has a "Flight Simulator" column. CONTEXT's `flight_log_time.kind` enum doesn't include it.
   - Recommendation: add `is_simulator boolean not null default false`. Sim flights are recorded with kind=`dual_received` + `is_simulator=true`. View aggregates sim-only totals.

6. **`compute_recency_currency` for 6HIT instrument currency — computed from what?**
   - What we know: CONTEXT says "from `flight_log_time` rows".
   - What's unclear: 61.57(c) requires 6 instrument approaches, holding, intercepting/tracking courses within 6 calendar months. Our `flight_log_time` tracks minutes, not approach counts.
   - Recommendation: add `instrument_approaches int default 0` to `flight_log_time`. Instructor enters at close-out. `compute_recency_currency('instrument_currency')` sums approaches in last 6 months. Holding/intercepting are captured in the `notes` text field — v1 doesn't enforce those two sub-requirements at the recency level (defer to Phase 6 rules engine).

---

## Validation Architecture

Phase 5 inherits the Phase 1-4 test harness. No new framework.

### Test Framework

| Property           | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| Framework          | `vitest` (existing) + raw `postgres-js` for RLS harness             |
| Config file        | `vitest.config.ts` at repo root, existing                           |
| Quick run command  | `pnpm --filter @part61/db test` or `pnpm --filter @part61/api test` |
| Full suite command | `pnpm test` (runs all workspaces)                                   |

### Required Test Coverage

- **Cross-tenant RLS tests** for every new table: `course`, `course_version`, `stage`, `course_phase`, `unit`, `lesson`, `line_item`, `lesson_grade_sheet`, `line_item_grade`, `stage_check`, `endorsement_template` (global — not tenant-scoped), `student_endorsement`, `flight_log_time`, `personnel_currency` (renamed, re-verify).
- **Seal trigger tests:** cannot UPDATE a sealed `lesson_grade_sheet` / `stage_check` / `student_endorsement`; sealing a grade sheet without all Required line_items graded raises P0001.
- **Transitive seal test:** cannot INSERT/UPDATE a `lesson` or `line_item` whose parent `course_version.published_at IS NOT NULL`.
- **Different-instructor trigger test:** `stage_check` INSERT with `checker_user_id = primary_instructor_id` raises P0001.
- **`clone_course_version` test:** clone a full 5-level tree, verify row counts match + parent FKs all remap + new `course_version.published_at IS NULL` + zero FK points to source_version tree.
- **`checkStudentCurrency` test:** student with no medical → `schedule.approve` throws `PRECONDITION_FAILED`. Student with current medical → approve succeeds.
- **Phase 3 regression:** full existing Phase 3 scheduling suite must stay green. Seed fixtures updated to include student currencies where needed.
- **Phase 4 regression:** full existing Phase 4 suite must stay green post-rename. Drizzle alias export is the safety net.
- **`flight_log_time` invariant test:** insert a row with `day+night` differing from Hobbs delta by > 6 min → P0001.
- **`user_flight_log_totals` view test:** RLS flows through — student A cannot see student B's totals.
- **Ban-term regex test:** `14 CFR 141.101` does not trip.

### Sampling Rate

- **Per task commit:** `pnpm --filter @part61/db test -- --run` (fast, ~10s at Phase 4 baseline)
- **Per wave merge:** full `pnpm test`
- **Phase gate:** full suite green before `/gsd:verify-work`, plus manual human verify of close-out → grade sheet → seal → 141.101 PDF → endorsement issue → student `/record` view.

### Wave 0 Gaps

None — Phase 1-4 test infrastructure covers all Phase 5 needs. New tests are additive. Fixtures in `tests/fixtures/` need extension for enrolled students with currencies; that's a Wave 0 task in the plan.

---

## Sources

### Primary (HIGH confidence)

- `.planning/phases/05-syllabus-model-grading-records/05-CONTEXT.md` — all locked decisions
- `.planning/REQUIREMENTS.md` — SYL-01..14, SYL-25, STU-02, STU-03, SCH-12
- `.planning/ROADMAP.md` — Phase 5 success criteria
- `packages/db/src/schema/currencies.ts`, `personnel.ts`, `enums.ts`, `reservations.ts` — existing schema patterns
- `packages/db/migrations/0009_phase4_enums.sql` — enum-alone migration pattern
- `packages/api/src/procedures.ts` — composed procedure pattern
- `apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/pdf/LogbookPdfDocument.tsx` — PDF template
- `apps/web/app/(app)/dispatch/close/[id]/CloseOutForm.tsx` — close-out form to extend
- Postgres 17 docs — `num_nonnulls`, `ALTER TYPE ... ADD VALUE` transaction caveat, `security_invoker` views (all native features, HIGH)

### Secondary (MEDIUM confidence)

- [AC 61-65K — Certification: Pilots and Flight and Ground Instructors (current)](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_61-65K.pdf)
- [AC 61-65J — CANCELLED](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1043278)
- FAA ACS downloads index: https://www.faa.gov/training_testing/testing/acs

### Tertiary (LOW confidence — flag for plan-time verification)

- IACRA 8710-1 exact field list — verify at Wave D task-0
- Louisiana Tech / Auburn / UA TCO public availability — verify at Wave F task-0, fall back to ACS-only
- `@react-pdf/renderer` creationDate determinism prop — verify before claiming byte-determinism

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already vetted in Phases 1-4
- Architecture patterns: HIGH — all patterns proven in prior phases (seal trigger, rename, exclusive-FK via CHECK, security_invoker view, invariant trigger)
- Common pitfalls: HIGH — enum caveat and rename strategy both replayed from real Phase 2/3/4 experience
- AC 61-65 current revision: HIGH — verified as K, J is cancelled
- IACRA 8710-1 field list: MEDIUM — need plan-time read of current form
- Seeded course sources: MEDIUM — ACS is reliable, universities need license check
- `clone_course_version` performance: HIGH — trivial at ~300 rows

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (30 days — stable domain, FAA ACs revise yearly at most)
