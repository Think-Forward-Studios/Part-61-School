---
phase: 05-syllabus-model-grading-records
plan: 02
subsystem: syllabus-seeds
tags: [seed, ac-61-65k, syllabus, endorsement-template, catalog]
requires:
  - 05-01 (course tree + endorsement_template + clone_course_version)
  - phase-04-05 seed-survives-cascade pattern (supabase/seed.sql re-insert)
provides:
  - AC 61-65K endorsement_template catalog (22 rows)
  - 3 system courses (PPL-SE, IR-SE, CSEL) with school_id=null
  - One published v1.0 course_version per course (absolute_ipm)
  - Full 3-level tree: 9 stages, 63 lessons, 252 line_items
  - public.fn_phase5_seed_courses() idempotent reusable seeder
  - tests/rls/phase5-seed.test.ts (9 assertions)
affects:
  - supabase/seed.sql (courses re-seed block + endorsement no-op comment)
tech-stack:
  added: []
  patterns:
    - "Seed catalog rows with fixed UUIDs + ON CONFLICT DO NOTHING for idempotent re-seed"
    - "Reusable pl/pgsql seed function called from both migration and seed.sql"
    - "Canonical FAA 'approved' text lives in .sql only (banned-term lint skips .sql)"
    - "endorsement_template survives TRUNCATE schools CASCADE (no FK to schools) — no re-seed block needed"
key-files:
  created:
    - packages/db/migrations/0019_phase5_seed_endorsements.sql
    - packages/db/migrations/0020_phase5_seed_courses.sql
    - supabase/migrations/20260409000006_phase5_seed_endorsements.sql
    - supabase/migrations/20260409000007_phase5_seed_courses.sql
    - tests/rls/phase5-seed.test.ts
  modified:
    - supabase/seed.sql
decisions:
  - "Used the current AC 61-65K revision (61-65J is cancelled). Research confirmed K is the live document."
  - "endorsement_template has NO FK to public.schools, so TRUNCATE schools CASCADE leaves it alone — no re-seed block in seed.sql, only a comment explaining why."
  - "Course seeds encapsulated in public.fn_phase5_seed_courses() so both the migration and supabase/seed.sql call the same implementation. Eliminates ~400 lines of duplicated DML."
  - "Fixed catalog UUIDs (55555555-5555-5555-5555-55555555555X) with ON CONFLICT DO NOTHING make the seeder fully idempotent across db reset cycles."
  - "published_at = now() on all 3 course_versions so downstream plans can clone + fork immediately. Tree INSERTs happen inside the same migration transaction with published_at already set, which is safe because fn_syllabus_tree_seal_guard only fires on UPDATE."
  - "3-level depth (Stage -> Lesson -> LineItem) chosen: simpler for the reference seeds, schools that want Phase/Unit layers add them when they fork. min_levels=3 on course_version."
  - "Line items use ACS task codes (PA.V.A, CA.V.D, etc.) where applicable so the seeds map cleanly to the FAA standard."
  - "Banned-term text: canonical FAA endorsement wording contains 'approved' and related terms. Kept in .sql only — the ESLint rule skips .sql files. Descriptions / objectives / completion_standards in course seeds avoid the banned phrases entirely (use 'required', 'authorized', CFR section citations)."
metrics:
  duration: 22m
  tasks: 2
  files: 6
  tests_added: 9
  tests_total: 175
  completed: 2026-04-09
---

# Phase 5 Plan 02: Syllabus Seeds Summary

Canonical AC 61-65K endorsement catalog plus 3 system courses (PPL / IR / Commercial SEL) seeded as `school_id = null` global templates that schools fork via `clone_course_version`. Seeds survive `supabase db reset` via a reusable pl/pgsql seeder called from both the migration path and `supabase/seed.sql`.

## What Landed

### Task 1 — migration 0019: AC 61-65K endorsement catalog

- 22 `endorsement_template` rows covering:
  - **Appendix A (student pilot / solo / XC):** A.1 pre-solo knowledge, A.2 pre-solo flight training, A.3 solo, A.4 solo TO/LDG at another airport, A.5 initial solo XC, A.6 per-flight solo XC, A.7 repeated solo XC ≤50 NM, A.8 solo in Class B, A.9 solo to/from Class B airport, A.10 solo TO/LDG in Class B.
  - **Appendix B (reviews, class ratings, practical):** B.1 flight review, B.2 IPC, B.3 complex, B.4 high-performance, B.5 pressurized / high-altitude, B.6 tailwheel, B.7 retest after failure, B.8 prerequisites for practical test, B.9 knowledge test recommendation, B.10 practical test recommendation, B.11 glider tow, B.12 sport-pilot solo.
- Each row: `code`, `title` (canonical FAA wording), `body_template` with double-curly placeholders (`{{student_name}}`, `{{instructor_cfi_number}}`, `{{date}}`, …), `category` enum, `ac_reference` ("AC 61-65K, A.5" style).
- **Seed survival:** `endorsement_template` has no FK to `public.schools`, so the `TRUNCATE schools CASCADE` at the top of `supabase/seed.sql` leaves it untouched. Added a comment in seed.sql explaining why no re-seed block is needed. Verified: `endorsement_template` still has 22 rows after `supabase db reset`.

### Task 2 — migration 0020: 3 system courses

- **Fork-friendly seeder:** migration 0020 defines `public.fn_phase5_seed_courses()`, an idempotent pl/pgsql function that inserts the 3 courses, their single published `v1.0 (Reference)` `course_version`, all stages, lessons, and line items in one transaction. Migration runs `select public.fn_phase5_seed_courses()` at the end. `supabase/seed.sql` also calls the function inside a `DO` block to restore rows after `TRUNCATE schools CASCADE`.
- **Fixed UUIDs + ON CONFLICT DO NOTHING** on `course` and `course_version` make the seeder fully idempotent. Re-running it is a no-op.
- **Three courses, all `school_id = null`:**

  | Course  | Code    | Rating              | Stages | Lessons | Line items |
  | ------- | ------- | ------------------- | -----: | ------: | ---------: |
  | Private Pilot ASEL     | PPL-SE  | private_pilot             | 3 | 25 | 100 |
  | Instrument Rating SE   | IR-SE   | instrument_rating         | 3 | 20 |  80 |
  | Commercial Pilot SE    | CSEL    | commercial_single_engine  | 3 | 18 |  72 |
  | **Totals**             |         |                           | **9** | **63** | **252** |

  All three: `grading_scale = 'absolute_ipm'`, `min_levels = 3`, `published_at = now()`.
- **Source citations in descriptions** — every course description reads "Derived from publicly-available Louisiana Tech / Auburn University / University of Alabama TCO materials and the FAA [PPL-A | IR-A | Comm-A] ACS. Schools should fork and customize before use." Sets expectations that seeds are a starting point, not a legally compliant course.
- **Line items map to ACS tasks** where applicable (e.g. "Steep turns — CA.V.E", "ILS precision approach — IR Area V"). Classification mix: mostly `required`, key maneuvers like accuracy landings / XC diversion / emergency procedures tagged `must_pass`, a handful `optional`.
- **Banned-term discipline in course text:** descriptions / objectives / completion_standards avoid "approved" and "Part 141" entirely, using "required", "authorized", and CFR citations (§61.87, §61.93, §61.109, §61.129) instead.

### Seed verification — `tests/rls/phase5-seed.test.ts`

Nine Vitest assertions (all green):

1. `endorsement_template` has ≥20 rows
2. Core A.1–A.5 + B.1/B.2/B.8/B.10 codes present
3. Every endorsement cites an `AC 61-65K` reference
4. Exactly 3 courses with `school_id = null`
5. The three `rating_sought` values (PPL, IR, CSEL) are covered
6. Each system course has exactly one `published_at is not null` version with `grading_scale = 'absolute_ipm'`
7. ≥50 lessons and ≥250 line_items across the 3 system courses (actual: 63 / 252)
8. PPL has ≥3 stages
9. `clone_course_version(ppl_version_id, school_A_id)` returns a new uuid, identical lesson + line_item counts to the source, and the fork is a draft (`published_at is null`)

The test file calls `seedTwoSchools()` then `public.fn_phase5_seed_courses()` in `beforeAll` so it is independent of the other test files' TRUNCATE order. Clone cleanup uses soft-delete (`set deleted_at = now()`) because the syllabus hard-delete blocker forbids hard DELETE.

## Verification

| Gate                                     | Result                                                            |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dlx supabase db reset`             | all 21 migrations apply cleanly + seed.sql re-seeds courses       |
| endorsement_template count               | **22** (≥20 required)                                             |
| system course count                      | **3** PPL / IR / CSEL with school_id=null, all published          |
| lesson / line_item totals                | **63 / 252** (targets: ≥50 / ≥250)                                |
| `pnpm --filter @part61/rls-tests test`   | **175/175 green** (166 prior + 9 new)                             |
| `pnpm -r lint`                           | green (banned-term rule clean — FAA text stays in .sql)           |
| `pnpm -r typecheck`                      | green (6 workspaces)                                              |

## Deviations from Plan

### Auto-fixed

**1. [Rule 3 — Blocking] Invalid placeholder UUIDs in pl/pgsql constants**

- **Found during:** Task 2 initial migration write
- **Issue:** First draft defined `c_ppl_id constant uuid := '55555555-5555-5555-5555-55555555ppl1'::text::uuid` — not a valid UUID (letters outside 0-9a-f).
- **Fix:** Removed the constants entirely; use the literal fixed UUIDs (`55555555-5555-5555-5555-555555555551..3` for courses, `...a` suffix for course_versions) directly in the INSERT ... ON CONFLICT statements.
- **Files modified:** `packages/db/migrations/0020_phase5_seed_courses.sql`
- **Commit:** d6f51fe

**2. [Rule 1 — Bug] Hard DELETE rejected by syllabus hard-delete blocker in the clone round-trip cleanup**

- **Found during:** Task 2 first full test run
- **Issue:** `phase5-seed.test.ts` used `delete from public.line_item ...` to clean up the fork. The 05-01 hard-delete trigger raised `P0001: Hard delete is not permitted on table line_item. Use soft delete (set deleted_at).`
- **Fix:** Switched cleanup to `update ... set deleted_at = now()` for every tree table. Works because the clone is a draft (`published_at is null`) so `fn_syllabus_tree_seal_guard` does not fire.
- **Files modified:** `tests/rls/phase5-seed.test.ts`
- **Commit:** d6f51fe

### Shape Choices

- **Seed depth = 3 (Stage / Lesson / LineItem), min_levels = 3.** Plan offered 5-6. Picked 3 because (a) the course_phase / unit tables are documented as optional middle layers that schools add when they fork, (b) it matches the "minimum viable starting point" quality bar the plan calls for, (c) simpler tree = fewer rows to maintain in the reference seed. Schools get the full 5-level depth machinery from 05-01 whenever they need it.
- **`fn_phase5_seed_courses` helper function** instead of duplicating 400+ lines of DML between the migration and `supabase/seed.sql`. Both paths call the same function; idempotency guaranteed by the fixed-UUID + ON CONFLICT DO NOTHING pattern.
- **Endorsement survival via NO-op, not a re-seed block.** `endorsement_template` has no school FK — verified against 05-01 schema — so `TRUNCATE schools CASCADE` does not touch it. Added an explanatory comment in seed.sql so a future reader doesn't "fix" the apparent missing re-seed.

## Requirements Closed

- **SYL-02** — Seed templates for PPL, IR, and Commercial SEL derived from public TCO materials. Three courses, 9 stages, 63 lessons, 252 line items with source citation in each description.
- **SYL-03** — Published vs draft course_version distinction exercised: seeded versions are `published_at = now()` and are immediately forkable via `clone_course_version`, which creates drafts (verified by the round-trip test).
- **SYL-09** — AC 61-65 endorsement catalog seeded: 22 templates covering Appendix A student-pilot / solo / XC and Appendix B reviews / class ratings / practical test. Rendered with placeholders ready for per-issuance snapshot substitution in Plan 05-03.

## Follow-ups

- Plan 05-03 (tRPC routers) will add `admin.courses.*` with a "Fork from system template" mutation that calls `public.clone_course_version` under the caller's school_id.
- Plan 05-03 will add `admin.endorsements.list` to surface the 22 templates in the catalog UI.
- Plan 05-04 will wire the lesson picker at close-out to these seeded lesson IDs.

## Commits

- `3bc91b5` — feat(05-02): seed AC 61-65K endorsement template catalog (Task 1)
- `d6f51fe` — feat(05-02): seed 3 system courses (PPL / IR / CSEL) + seed verification tests (Task 2)

## Self-Check: PASSED

- `packages/db/migrations/0019_phase5_seed_endorsements.sql` exists
- `packages/db/migrations/0020_phase5_seed_courses.sql` exists
- `supabase/migrations/20260409000006_phase5_seed_endorsements.sql` exists
- `supabase/migrations/20260409000007_phase5_seed_courses.sql` exists
- `tests/rls/phase5-seed.test.ts` exists (9 tests)
- `supabase/seed.sql` modified to call `fn_phase5_seed_courses()` and comment endorsement survival
- commits `3bc91b5` and `d6f51fe` resolve in `git log --oneline`
- `pnpm dlx supabase db reset` → 21 migrations clean, seeds intact
- 175/175 RLS tests green
- `pnpm -r lint` / `pnpm -r typecheck` green monorepo-wide
