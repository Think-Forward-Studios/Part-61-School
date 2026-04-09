# Phase 6: Syllabus Rules, Progression & Audit - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Activate the syllabus. Phase 5 built the records (course tree, enrollments, grade sheets, currencies); Phase 6 makes those records drive scheduling and grading decisions. Implements: incomplete line item rollover, prerequisite enforcement, currency + qualification + resource gating on both scheduling and grading, management override for out-of-order work, real-time course minimums tracker with ahead/behind plan + projected checkride date, next-activity suggestion, nightly automated training-record audit.

Phase 6 does NOT ship: new record types (all data models land in Phase 5), email/SMS notifications (Phase 8), ADS-B fleet integration (Phase 7), mobile (v2), reporting dashboards beyond the audit exception list (Phase 8 polish), DPE scheduling (out of scope).

Covers requirements: SYL-15, SYL-16, SYL-17, SYL-18, SYL-19, SYL-20, SYL-21, SYL-22, SYL-23, SYL-24, SCH-05, SCH-11, SCH-14, IPF-06.

</domain>

<decisions>
## Implementation Decisions

### Rules engine location

- **SQL functions throughout.** Each rule is a PL/pgSQL function that returns a consistent result shape. Called from tRPC procedures, from RLS policies where needed, and from the pg_cron audit job. Consistent with Phase 3 `is_airworthy_at` + Phase 4 `recompute_maintenance_status` + Phase 5 `currency_status`.
- **Canonical signatures:**
  - `public.check_lesson_prerequisites(enrollment_id uuid, lesson_id uuid) returns jsonb` — `{ ok: bool, missing_lessons: uuid[] }`
  - `public.check_student_qualifications(enrollment_id uuid, lesson_id uuid) returns jsonb` — `{ ok: bool, missing_currencies: text[], missing_qualifications: text[] }`
  - `public.check_instructor_qualifications(instructor_user_id uuid, lesson_id uuid) returns jsonb` — `{ ok: bool, missing_currencies: text[], missing_qualifications: text[] }`
  - `public.check_resource_requirements(aircraft_id uuid, lesson_id uuid) returns jsonb` — `{ ok: bool, missing_tags: text[], missing_type: text, missing_sim_kind: text }`
  - `public.check_lesson_repeat_limit(enrollment_id uuid, lesson_id uuid) returns jsonb` — `{ ok: bool, current_count: int, max: int, exceeded: bool }`
  - `public.evaluate_lesson_eligibility(enrollment_id uuid, lesson_id uuid, aircraft_id uuid, instructor_user_id uuid) returns jsonb` — orchestrates all of the above into `{ ok: bool, blockers: jsonb[] }`. Returns early on active override.
- **tRPC wraps each function** in a typed procedure so the UI gets a typed reason-list for blockers. Backend errors map to `PRECONDITION_FAILED` with a structured blockers payload.

### Incomplete line item rollover (SYL-15)

- **Virtual rollover on grade sheet creation.** When `gradeSheet.createFromReservation(reservationId, lessonId)` runs, it calls a new SQL helper `compute_rollover_line_items(enrollment_id, target_lesson_id)` which:
  1. Queries all prior sealed `lesson_grade_sheet` rows for this enrollment
  2. For each, finds `line_item_grade` rows where `line_item.classification IN ('required', 'must_pass')` AND the grade is not passing (by `isPassingGrade` helper from Phase 5 domain)
  3. Filters to only line items that have NOT been satisfactorily graded in any later sealed sheet since (so a later re-do clears the rollover)
  4. Returns an array of `{ source_grade_sheet_id, line_item_id }`
- `gradeSheet.createFromReservation` uses this to seed additional `line_item_grade` stub rows on the new sheet — tagged with `rollover_from_grade_sheet_id` FK (new nullable column added to `line_item_grade` via a new migration).
- The grade sheet editor UI (Phase 5-04) renders rollover rows with a distinct "Rolled forward from Lesson X (date)" chip + the original line item's objectives so the instructor knows what they're re-attempting.
- Sealing the new sheet satisfies the rollover automatically if the grade passes. A failing grade keeps the rollover active until a future sheet finally passes.

### Prerequisite enforcement (SYL-16)

- **`lesson.prerequisite_lesson_ids uuid[]` column** added via new migration. Array of lesson IDs that must be satisfactorily completed in sealed grade sheets for this enrollment before the target lesson can be scheduled OR graded.
- "Satisfactorily completed" means: a sealed grade sheet exists where all Required + Must Pass line items have passing grades per the lesson's grading scale.
- `check_lesson_prerequisites(enrollment_id, lesson_id)` returns the list of missing prerequisite lesson IDs (or `[]` if ok).
- Gate enforcement at TWO points:
  1. **Scheduling:** `schedule.approve` calls `evaluate_lesson_eligibility` which includes prerequisites. Blockers returned as `PRECONDITION_FAILED`.
  2. **Grading:** `gradeSheet.createFromReservation` calls `check_lesson_prerequisites`. Blockers returned as `PRECONDITION_FAILED`.
- Both gates respect active overrides (see SYL-17).

### Management override (SYL-17)

- **New `lesson_override` table** mirroring Phase 4 `maintenance_overrun` pattern:
  - `id`, `school_id`, `base_id`, `student_enrollment_id` FK, `lesson_id` FK, `kind` enum (`prerequisite_skip | repeat_limit_exceeded | currency_waiver`), `justification text CHECK (length >= 20)`, `granted_at`, `granted_by_user_id`, `signer_snapshot jsonb` (Phase 4 pattern: full_name + cert_type + cert_number + granted_at), `expires_at timestamptz` (default `now() + interval '30 days'`), `consumed_at timestamptz` (nullable — set when a grade sheet is created against it), `revoked_at timestamptz`, `revoked_by_user_id`, `revocation_reason`, audit + hard-delete blocker.
- **Who can grant:** `adminOrChiefInstructorProcedure` (from Phase 5) — admin role OR instructor with `user_roles.is_chief_instructor = true`.
- **UI surface:** when a scheduling or grading attempt returns `PRECONDITION_FAILED` with blockers, admins/chief instructors see a "Grant override" button on the blockers panel. Opens a modal requiring justification (min 20 chars), expiration (default 30d), confirmation of IA/chief-instructor cert snapshot. Submitting creates the row. Non-override-holders see a read-only blocker list.
- **Override consumption:** single-use. On first grade sheet creation against the enrollment+lesson with an active unexpired unconsumed override, `consumed_at = now()`. Second attempt without a fresh override hits the blockers again.
- **Audit:** every grant, consumption, and revocation writes to `audit_log` (Phase 1 trigger). A separate materialized `management_override_activity` view surfaces recent overrides on the admin dashboard for IPF-06 alerting.
- **IPF-06 integration:** admin dashboard gets a "Recent management overrides" panel showing the last 30 days of overrides — links to student profile, justification text, granter name.

### Authorized repeat counts (SYL-20)

- **Per-line-item + per-lesson nullable max.** Add columns via new migration:
  - `line_item.max_repeats int` (nullable = unlimited)
  - `lesson.max_repeats int` (nullable = unlimited)
- `check_lesson_repeat_limit(enrollment_id, lesson_id)` counts distinct sealed `lesson_grade_sheet` rows for this (enrollment, lesson) pair. If count >= max_repeats, returns `{ ok: false, exceeded: true, current_count, max }`.
- Exceeding triggers the same management override path as SYL-17 with `kind='repeat_limit_exceeded'`.
- **UI:** the grade sheet editor shows "Attempt N of M" when applicable, warning badge when M-1 reached.

### Lesson resource + qualification requirements (SYL-18, SYL-19, SCH-11)

- **Extend `lesson` table** via new migration (Phase 5 added `required_currencies jsonb`; Phase 6 adds):
  - `required_instructor_qualifications jsonb` — array of `instructor_qualification.descriptor` strings (e.g. `["CFII"]`, `["MEI"]`) the teaching instructor must hold
  - `required_instructor_currencies jsonb` — array of currency_kind values the instructor must hold
  - `required_student_qualifications jsonb` — array of student qualification kinds (e.g. `["solo_endorsement_scope"]`)
  - `required_aircraft_equipment jsonb` — array of `aircraft_equipment_tag` values (e.g. `["ifr_equipped"]`, `["complex"]`)
  - `required_aircraft_type text` — specific aircraft model (e.g. `"C172"`) or null
  - `required_sim_kind text` — for simulator lessons, the sim type identifier
- `check_instructor_qualifications(instructor_user_id, lesson_id)` reads the lesson's requirements + joins `personnel_currency` + `instructor_qualification` for the instructor.
- `check_student_qualifications(enrollment_id, lesson_id)` reads lesson requirements + joins student's `personnel_currency` + any student-side qualification rows.
- `check_resource_requirements(aircraft_id, lesson_id)` reads lesson requirements + joins `aircraft_equipment` (Phase 2 tag table).
- **Rules engine composition:** `evaluate_lesson_eligibility` orchestrates all checks in a deterministic order and returns a unified `blockers` array. Order matches inspector expectations: prerequisites → student currencies → student qualifications → instructor currencies → instructor qualifications → aircraft equipment → aircraft type/sim kind → repeat limit.

### Course minimums tracker (SYL-21)

- **New `course_version.minimum_hours jsonb` column** — defines FAA minimums per 61.109 / 61.65 / 61.129 for PPL / IR / Comm-SEL. Shape:
  ```json
  {
    "total": 40,
    "dual": 20,
    "solo": 10,
    "cross_country": 5,
    "night": 3,
    "instrument": 3,
    "solo_cross_country": 5,
    "solo_cross_country_long": { "distance_nm": 150, "stops": 3 },
    "landings_day": 10,
    "landings_night": 10
  }
  ```
- Seeds updated in a new migration to populate PPL / IR / Comm-SEL with current §61 minimums (Phase 5 seeds remain valid, Phase 6 backfills `minimum_hours`).
- **Real-time tracker SQL view** `student_course_minimums_status` using `WITH (security_invoker = true)`. For each active enrollment, joins `flight_log_time` (Phase 5) and computes current totals per category + compares against `course_version.minimum_hours`. Returns per-category `{ required, actual, remaining, percent }`.
- **Student view:** read-only panel on `/record/courses/[enrollmentId]` showing progress bars + "X.X more hours of night cross-country needed" type messages.
- **Admin view:** same panel on `/admin/enrollments/[id]`.
- Updated in real time because the view always queries live `flight_log_time` rows — no caching in Phase 6.

### Ahead/behind plan indicator + projected dates (SYL-22, SYL-23)

- **Plan definition:** Calendar pace + cumulative hours.
- **New `student_course_enrollment.plan_cadence_hours_per_week numeric` column** — configurable at enrollment time. Default pulled from `course_version.default_plan_cadence_hours_per_week` (also new). Common defaults: PPL 4 h/wk (part-time), IR 3 h/wk, Comm SEL 3 h/wk.
- **SQL function `student_progress_forecast(enrollment_id) returns jsonb`:**
  - Expected cumulative hours at today = `(weeks since enrolled_at) * plan_cadence_hours_per_week`
  - Actual cumulative hours from `flight_log_time` where the student is the pilot-in-the-seat
  - `ahead_behind` = `actual - expected` in hours
  - `ahead_behind_weeks` = `ahead_behind / plan_cadence`
  - Remaining hours = `max(0, minimum_hours.total - actual)`
  - `projected_checkride_date` = `today + (remaining / plan_cadence_hours_per_week) weeks`
  - `projected_completion_date` = `projected_checkride_date + 14 days` (buffer for checkride scheduling)
  - Confidence level = `low` if enrolled < 4 weeks (too little signal), `medium` if 4-12 weeks, `high` if > 12 weeks
- **Cache:** like Phase 4 `aircraft_downtime_forecast`, results cached in a `student_progress_forecast_cache` table refreshed by a trigger on `flight_log_time` insert/update. Keeps student profile queries fast.
- **Display:** chip on student profile + enrollment detail: "Ahead by 2.3 weeks — projected checkride 2026-06-15". Color: green (ahead), amber (<1 week behind), red (>2 weeks behind).

### Next-activity suggestion (SCH-14)

- **SQL function `suggest_next_activity(enrollment_id) returns jsonb`:**
  - Reads the course_version tree in order (stage → phase → unit → lesson)
  - For each lesson in order, checks:
    1. Is it already satisfactorily completed? Skip.
    2. Are its prerequisites met (`check_lesson_prerequisites`)? If no, skip.
    3. Does the student have required currencies (`check_student_qualifications`)? If no, return with `blocked_by: 'student_currency'` + details.
  - First lesson that passes (or is blocked only by currency/qualification with details) is returned with `{ lesson_id, reasoning }`.
  - Also returns rollover state: if any prior lesson has rollover line items still outstanding, prefer re-running that lesson first.
- **UI surfaces:**
  - Admin student profile `/admin/people/[id]` — `NextActivityChip` panel showing the suggestion + reasoning + "Schedule this lesson" button that deep-links to `/schedule/request?lessonId=...&studentId=...`
  - Student `/record` dashboard — same chip, student can click to request a reservation
  - `/schedule/request` form — if a student is pre-selected, auto-populate the lesson picker with the suggestion (still overridable)
- The chip also shows any blockers: "Suggestion: Lesson 7 (Stalls). ⚠ Blocked: medical class 3 expires in 3 days."

### Nightly training-record audit (SYL-24)

- **pg_cron extension** (built into Supabase Postgres).
- **Nightly job registered via migration:**
  ```sql
  select cron.schedule(
    'phase6_nightly_training_record_audit',
    '0 7 * * *',          -- 07:00 UTC daily
    'select public.run_training_record_audit()'
  );
  ```
- `public.run_training_record_audit()` PL/pgSQL function iterates active enrollments (where `completed_at` is null and `withdrawn_at` is null) and for each:
  - Missing lessons vs course minimums
  - Missing endorsements vs stage requirements (for stages that require specific endorsements like pre-solo)
  - Hours deficit vs minimums (warning tier: >90% of schedule elapsed but hours < 60% of required)
  - Missing stage checks (stages with completed lessons but no stage_check row)
  - Sealed grade sheets with rollover line items still outstanding after N weeks
  - Overrides that have expired without being consumed
- **Exceptions written to `training_record_audit_exception` table:**
  - `id`, `school_id`, `student_enrollment_id`, `kind` enum (`missing_lessons | hours_deficit | missing_endorsements | missing_stage_checks | stale_rollovers | expired_overrides`), `severity` enum (`info | warn | critical`), `details jsonb`, `first_detected_at`, `last_detected_at`, `resolved_at timestamptz` (set on a subsequent run when the issue is cleared)
- **Admin audit dashboard:** new route `/admin/audit/training-records` — table of open exceptions grouped by severity, click through to the student profile.
- Cron function is idempotent — re-running mid-day reconciles the exception table without duplicates.

### SCH-05 / SCH-11 wiring (scheduling gates)

Phase 5 shipped `schedule.checkStudentCurrency` as a simple currency check. Phase 6 extends `schedule.approve` to call the full `evaluate_lesson_eligibility` function when `reservation.lesson_id IS NOT NULL`:

- After the Phase 3 airworthiness gate + the Phase 5 student-currency-only gate
- Call `evaluate_lesson_eligibility(enrollment_id, lesson_id, aircraft_id, instructor_user_id)`
- If `ok: false`, throw `PRECONDITION_FAILED` with `{ blockers }` payload
- Preserves the Phase 3/5 regression: when `reservation.lesson_id IS NULL`, the new gate is skipped entirely
- Phase 5's narrower `checkStudentCurrency` tRPC procedure stays for targeted UI queries (reservation request form wants just the currency list, not the full blocker set)

### New composed procedures + helpers

- **`chiefInstructorOnlyProcedure`** — extends `protectedProcedure` with a check that user has `instructor` role AND `user_roles.is_chief_instructor = true`. Used for override grant and version migration (Phase 5 procedure name was `adminOrChiefInstructorProcedure` which admits admin too; this is stricter). Placement in `packages/api/src/procedures.ts`.
- **`buildOverrideSignerSnapshot(ctx)`** — mirrors Phase 4 `buildSignerSnapshot` and Phase 5 `buildInstructorSignerSnapshot`. Validates authority (chief instructor or admin) and returns JSONB snapshot.

### tRPC router additions

- **`admin.overrides.*`** — list active overrides (for the dashboard panel), grant new override (chief instructor / admin), revoke override
- **`admin.audit.*`** — list training record audit exceptions, filter by severity/student, mark resolved (manual override for false positives), trigger a manual run of `run_training_record_audit()` (admin-only)
- **`schedule.evaluateLessonEligibility(enrollmentId, lessonId, aircraftId, instructorUserId)`** — called by the `/schedule/request` form to render blockers inline
- **`schedule.suggestNextActivity(enrollmentId)`** — called by `NextActivityChip`
- **`record.getMyProgressForecast()`** — student-facing projection
- **`admin.enrollments.getProgressForecast(enrollmentId)`** — admin view of forecast
- **`admin.enrollments.getMinimumsStatus(enrollmentId)`** — admin view of course minimums tracker
- **`record.getMyMinimumsStatus(enrollmentId)`** — student-facing tracker
- `gradeSheet.createFromReservation` extended to auto-seed rollover line items via `compute_rollover_line_items`

### Admin UI additions

- **`/admin/audit/training-records`** — exception dashboard with filter tabs, click-through to student
- **`/admin/overrides`** — all active overrides in the school (admin surveillance)
- **Student profile extensions** (drop-ins on `/admin/people/[id]`):
  - `MinimumsStatusPanel` — live minimums tracker
  - `ProgressForecastPanel` — ahead/behind + projected dates
  - `RolloverQueuePanel` — outstanding rolled-forward line items across all lessons
  - `NextActivityChip` — suggestion + schedule button
- **Enrollment detail extensions** (drop-ins on `/admin/enrollments/[id]`):
  - Same four panels, scoped to this enrollment
- **Reservation request form extension** (`/schedule/request`):
  - When student + lesson picked, show inline blocker list from `evaluateLessonEligibility`
  - Admin/chief-instructor sees "Grant override" button next to blockers
  - Override modal: justification + expiration + signer confirmation

### Student UI additions

- **`/record`** dashboard extensions:
  - `NextActivityChip` at the top
  - `MinimumsStatusPanel`
  - `ProgressForecastPanel`
  - Live rollover queue ("You have 3 line items to complete in your next lesson")

### Banned-term caveat

- Phase 6 adds no user-authored catalogs — all strings are internal enum values + display labels. Display labels go in `packages/domain/src/schemas/overrideKindLabels.ts` and `packages/domain/src/schemas/auditExceptionLabels.ts`, following the Phase 3+4+5 pattern (outside the banned-term lint glob).
- No "approved" in any .tsx source — use "authorized" / "granted" / "chief instructor approved" (where "approved" appears inside a compound like "chief-instructor-approved", rewrite to "chief instructor granted").

### Claude's Discretion

- Exact PL/pgSQL implementation for each check function (the signature is locked, the body is Claude's call within Phase 1-5 patterns)
- Severity thresholds for audit exceptions (warn vs critical)
- Refresh-on-insert vs nightly-materialized for the forecast cache
- Exact color palette for ahead/behind/at-plan chips
- Whether the override modal is a dialog or a dedicated page (dialog recommended, matches Phase 4 §91.409 pattern)
- Whether `NextActivityChip` shows only the next lesson or the next 3 (recommend just next, keep focused)
- Tree-walking strategy in `suggest_next_activity` (recursive CTE recommended)

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets (from Phases 1–5)

- **`schedule.checkStudentCurrency` + `schedule.approve` additive hook** from Phase 5 — Phase 6 extends the hook with the full `evaluate_lesson_eligibility` call path
- **`isPassingGrade(scale, value)` helper** in `packages/domain` — Phase 6 uses it when computing rollover and prerequisite satisfaction
- **Phase 4 `buildSignerSnapshot` + Phase 5 `buildInstructorSignerSnapshot`** — mirror pattern for `buildOverrideSignerSnapshot`
- **Phase 4 `maintenance_overrun` pattern** (justification + cert snapshot + expires_at + consumed_at) — Phase 6 `lesson_override` is a direct mirror
- **Phase 4 `aircraft_downtime_forecast` cache table + trigger refresh pattern** — Phase 6 `student_progress_forecast_cache` mirrors it
- **Phase 4 `recompute_maintenance_status` with SELECT FOR UPDATE serialization** — Phase 6 forecast refresh uses the same pattern
- **Phase 3 `is_airworthy_at` + Phase 5 `check_student_currency` signature pattern** — Phase 6 check functions all return `jsonb { ok, blockers }` shape
- **Phase 5 `lesson_grade_sheet` + `line_item_grade` seal contract** — Phase 6 queries sealed rows only when computing rollover / prerequisite satisfaction
- **Phase 5 `user_flight_log_totals` view** — Phase 6 minimums tracker queries this
- **Phase 5 `course_version` + course tree schema** — Phase 6 extends `lesson` with prerequisite + qualification + resource columns via additive migrations
- **Phase 5 `adminOrChiefInstructorProcedure`** — Phase 6 reuses it where admin override is also permitted; `chiefInstructorOnlyProcedure` is new (stricter variant)
- **Phase 2 `instructor_qualification` + `aircraft_equipment` tag tables** — Phase 6 check functions join these
- **`withTenantTx` middleware** — every Phase 6 DB call routes through it

### Established Patterns

- SQL function over app-tier logic (Phase 3 is_airworthy_at, Phase 4 recompute_maintenance_status, Phase 5 currency_status, clone_course_version)
- Check functions return `jsonb { ok: bool, ...detail }` (consistent across Phase 5 + 6)
- Forecast/prediction cache tables refreshed by trigger (Phase 4)
- Override tables with signer snapshot + justification + expiry + consumed_at (Phase 4)
- Seal trigger on grade sheets / overrides (Phase 4 + 5)
- Nightly jobs via pg_cron (new in Phase 6 — first use in project, Supabase built-in)
- Hand-authored migrations mirrored to `supabase/migrations/` (Phase 1–5)
- Enum extensions in their own migration file separate from usage (Phase 2–5 caveat)
- `pgPolicy to: 'authenticated'` string literal (Phase 1 lesson)
- Display labels in `packages/domain/src/schemas/*Labels.ts` outside banned-term lint glob

### Integration Points

- `gradeSheet.createFromReservation` gets rollover seeding + prerequisite check (Phase 5 → Phase 6)
- `schedule.approve` gets the full eligibility gate (Phase 3 + 5 → Phase 6)
- `/schedule/request` form gets inline blocker display (Phase 3 UI → Phase 6 wiring)
- Admin dashboard gets overrides panel (Phase 4 pattern → Phase 6 content)
- Admin dashboard gets audit exception count (new in Phase 6)
- Student profile + enrollment detail get the four new panels (Phase 2 profile → Phase 6 drop-ins)
- `/record` student dashboard gets next-activity chip + minimums + forecast (Phase 5 → Phase 6)

</code_context>

<specifics>
## Specific Ideas

- Override modal should feel identical in ceremony to Phase 4's §91.409 modal — same "this is legally significant" weight
- Blocker list on scheduling form should be surgical: each blocker has an icon (⚠) + a single sentence + (if applicable) a "How to fix" link (e.g. "Update medical class 3 date" deep-links to the currency panel)
- Ahead/behind chip should not feel punitive — "Behind by 1 week" shouldn't be red until the student is >2 weeks behind. Encouragement-first language
- The nightly audit should be silent when everything is clean — no alerts spam. Only surface exceptions in the dashboard, never push notifications (Phase 8)
- Rollover line items in the grade sheet editor should visually distinguish from new line items — different background tint + "Re-attempt" badge so instructor understands context at a glance
- Next-activity suggestion reasoning should be human-readable: "Prerequisites met. Medical current. Aircraft N12345 is IFR-equipped. Instructor holds CFII." — not just a boolean

</specifics>

<deferred>
## Deferred Ideas

- **Email/SMS notification of audit exceptions** — Phase 8 (notifications)
- **Exception severity escalation over time** (e.g. auto-upgrade from warn to critical after 7 days unresolved) — v2
- **Predictive analytics / ML-based checkride date projection** — v2 (v1 uses linear extrapolation)
- **IACRA pre-check validation** (is the student ready to file 8710-1?) — v2
- **DPE scheduling integration** — out of scope per PROJECT.md
- **Bulk override (entire class) for weather events** — v2
- **Override approval workflow (request → admin approval)** — v2; v1 has instant grant by authorized personnel
- **Gamified progress display (streaks, badges)** — v2
- **Historical trend chart ("your weekly pace over 6 months")** — v2
- **Resource availability forecasting** (e.g. "N12345 will be grounded for annual on 2026-05-01 — block reservations?") — already partially covered by Phase 4 downtime prediction; deeper integration is Phase 8 polish
- **Multi-enrollment progress view** (a student enrolled in both PPL and IR simultaneously) — v2
- **Waiver expiration reminders** — Phase 8
- **Student-initiated override requests** — v2
- **Prerequisite graphs with "any-of-N" logic** — v2; v1 uses simple AND-of-lessons
- **Audit dashboard graph/chart view** — v2; v1 is a table

</deferred>

---

_Phase: 06-syllabus-rules-progression-audit_
_Context gathered: 2026-04-09_
