# Phase 5: Syllabus Model, Grading & Records - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the training-records pillar: the data model and UI that lets a Part 61 school structure a student's training as a deep versioned course tree, grade flight lessons against line items with signer snapshots, issue standard endorsements, record stage checks, track student currencies, and export records in formats an FAA inspector and a DPE recognize.

Phase 5 ships: the 6-level Course→Stage→Phase→Unit→Lesson→LineItem data model with versioning, 3 seeded templates (PPL / IR / Commercial SEL), student enrollment locked to a course_version, lesson grade sheets created at flight close-out (replacing the Phase 3 stub "Grade lesson" button), absolute/relative/pass-fail grading scales chosen per course version, a separate stage_check record type with different-instructor enforcement, an AC 61-65 endorsement catalog with per-issuance text snapshots, student currency tracking reusing the Phase 2 instructor_currency pattern, per-flight time categorization into 14 CFR 61.51(e) buckets, chronological 141.101(a)(2)-shaped training record PDF export per student per course, IACRA-friendly hours summary PDF+CSV export, and a student-facing read-only training record + flight log with self-serve PDF downloads.

Phase 5 does NOT ship: syllabus progression engine / rollover of incomplete line items / prerequisite enforcement / rules-engine gating (all Phase 6), automated syllabus-rule-driven scheduling blocks (Phase 6), ADS-B integration (Phase 7), email/push notifications of currency expiry (Phase 8), DPE scheduling/IACRA API integration (out of scope per PROJECT.md), AI-authored grades (out of scope).

Covers requirements: SYL-01, SYL-02, SYL-03, SYL-04, SYL-05, SYL-06, SYL-07, SYL-08, SYL-09, SYL-10, SYL-11, SYL-12, SYL-13, SYL-14, SYL-25, STU-02, STU-03, SCH-12.

</domain>

<decisions>
## Implementation Decisions

### Course hierarchy model (SYL-01, SYL-13, SYL-14)

- **Six distinct tables**, one per level, each FK'd to its parent:
  - `course` — top-level identity: `id`, `school_id` (null = system template), `code`, `title`, `rating_sought` enum (`private_pilot | instrument_rating | commercial_single_engine | commercial_multi_engine | cfi | cfii | mei | custom`), `description markdown`, `created_at`, `created_by`, `deleted_at`
  - `course_version` — the versioned snapshot users enroll into (see versioning below)
  - `stage` — FK to `course_version_id`, `position`, `code`, `title`, `objectives markdown`, `completion_standards markdown`
  - `course_phase` — FK to `stage_id`. **Optional middle layer** — a syllabus can skip phases by defining lessons directly under stages (`course_phase` rows absent). When absent, the UI and grade sheets hide the level.
    - Named `course_phase` in code (not just `phase`) to avoid collision with project-planning "phase" vocabulary
  - `unit` — FK to `course_phase_id` OR directly to `stage_id` (exclusive — a CHECK constraint enforces exactly one parent). Also optional middle layer.
  - `lesson` — FK to `unit_id` OR `course_phase_id` OR `stage_id` (exclusive parent). Minimum required level under a stage. Has `code`, `title`, `kind` enum (`ground | flight | simulator | oral | written_test`), `objectives markdown`, `completion_standards markdown`, `min_hours numeric`, `required_resources jsonb` (e.g. `{"aircraft_equipment_tag":"ifr_equipped"}` — Phase 6 consumes this)
  - `line_item` — FK to `lesson_id`, `position`, `code`, `title`, `description markdown`, `objectives markdown`, `completion_standards markdown`, `classification` enum (`required | optional | must_pass`), `grading_scale_override` enum nullable (null = inherit course_version scale)
- Each table gets the standard Phase 1-4 treatment: `school_id` column (inherited from course_version through a view-materialized path for RLS), audit trigger, hard-delete blocker, cross-tenant RLS test.
- **Skipping levels is explicit in the UI:** when a school forks a template, they pick the depth ("3-level: Stage → Lesson → Line Item", "4-level: Stage → Unit → Lesson → Line Item", "5-level: Stage → Phase → Unit → Lesson → Line Item"). Intermediate-level tables just don't have rows for that version.
- **Grade sheets always reference a `lesson`** (not a line_item directly and not a stage). Stage checks are separate (see below).

### Syllabus versioning (SYL-04)

- **Version-at-course level, student pinned to course_version_id at enrollment.**
  - `course_version` table: `id`, `course_id` (FK), `version_label` (e.g. "v1.0", "2026-Q1"), `published_at` (null = draft), `published_by`, `grading_scale` enum, `min_levels` int (the depth chosen), `notes markdown`, `superseded_at` (null = current).
  - Publishing a revision = create a new `course_version` row (via a deep-clone helper), make edits, set `published_at`. Old version stays published; new enrollees get the latest published by default.
  - **`student_course_enrollment` (Phase 2 minimal table) extended:** rename `course_descriptor` to `course_version_id` FK (with a migration that picks a default course_version for any existing rows). An enrolled student's grade sheets always reference THEIR version's lesson IDs.
  - **Version migration is explicit.** A chief instructor can move a student from v1 to v2 via a "Migrate enrollment" action that requires justification text + captures the source/target version IDs in an audit row. Normal operations never auto-migrate.
- **Editing a draft version is unrestricted.** Editing a published version is forbidden by trigger (seal pattern — same pattern as Phase 4 `logbook_entry.sealed`). Revisions require creating a new version.
- **Deep-clone helper:** a PL/pgSQL function `clone_course_version(source_version_id) returns uuid` copies the full tree. Runs inside a single transaction.

### Grading scale (SYL-06)

- **Per course_version.** `course_version.grading_scale` enum: `absolute_ipm` (Introduce / Practice / Perform / Mastered), `relative_5` (1-5 numeric vs standard), `pass_fail`.
- **Per-line-item override optional** via `line_item.grading_scale_override` nullable column — rarely used (e.g. a pass-fail checklist item inside an otherwise absolute-scale course), kept as an escape hatch.
- **Grading scale is locked on a version once published** — changing it would invalidate every prior grade. A school that wants to change scales creates a new version.
- **Display labels** live in `packages/domain/src/schemas/gradingLabels.ts` outside the banned-term lint glob, same pattern as `scheduleLabels.ts` / `maintenanceKindLabels.ts` from earlier phases.

### Lesson grade sheets (SYL-07)

- **One `lesson_grade_sheet` row per (reservation, lesson) pair.**
  - Columns: `id`, `school_id`, `base_id`, `reservation_id` (FK, nullable — allows back-filling paper grades not tied to a live reservation), `student_enrollment_id` (FK), `lesson_id` (FK to the version-pinned lesson), `conducted_at`, `conducted_by_user_id` (instructor), `ground_minutes`, `flight_minutes`, `overall_remarks markdown`, `status` enum (`draft | signed | sealed`), `signer_snapshot jsonb` (Phase 4 pattern), `sealed_at`, `deleted_at`, audit.
- **One `line_item_grade` per line item on the lesson.** Columns: `id`, `grade_sheet_id` (FK), `line_item_id` (FK), `grade_value` (text — stores either `'I'|'P'|'PM'|'M'` for absolute_ipm, or `'1'..'5'` for relative_5, or `'pass'|'fail'` for pass_fail), `grade_remarks`, `position` (for display order), `created_at`.
- **Append-only for sealed sheets.** A draft grade sheet can be edited freely. Once the instructor clicks "Sign and seal," a trigger validates completeness (every Required line item has a grade), captures the signer snapshot, sets `sealed_at = now()`, and flips status to `sealed`. After sealing, UPDATEs are forbidden by the same seal-trigger pattern from Phase 4 `logbook_entry`. Corrections = new grade sheet with `corrects_grade_sheet_id` FK.
- **Multiple lessons per flight supported:** the instructor can click "Add another lesson" on the close-out form. System creates a second grade sheet FK'd to the same reservation. Rare but matches reality (a 2-hour XC flight often covers two lessons).
- **Creation point:** replaces the Phase 3 stub "Grade lesson" placeholder button on `/dispatch/close/[id]` with a real flow. After Hobbs/tach/squawks are entered, instructor picks a lesson from a dropdown (filtered to the student's enrolled course_version's lessons, showing progress indicators), then grades each line item inline.

### Stage checks (SYL-08)

- **Distinct `stage_check` table** (not flagged grade sheet). Columns: `id`, `school_id`, `base_id`, `student_enrollment_id`, `stage_id` (which stage was checked), `checker_user_id` (instructor — CANNOT be the student's primary instructor, enforced server-side), `scheduled_at`, `conducted_at`, `status` enum (`scheduled | passed | failed`), `remarks markdown`, `signer_snapshot jsonb`, `sealed_at`, `deleted_at`, audit.
- **Different-instructor constraint:** a BEFORE INSERT/UPDATE trigger looks up the student's `student_enrollment.primary_instructor_id` and refuses if `checker_user_id` matches.
- Stage checks do NOT grade individual line items; they're a holistic stage-level pass/fail event with remarks.
- Appears on `/admin/stage-checks` (scheduled queue) and on the student training record chronologically.

### Endorsement library (SYL-09)

- **`endorsement_template` catalog** seeded with the full AC 61-65 standard endorsements (A.1 pre-solo aeronautical knowledge test, A.2 pre-solo flight training, A.3 solo, A.4 initial solo XC, A.5 solo XC (each flight), A.6 solo XC to within 25nm, A.7 repeated solo XC, A.8 complex, A.9 high performance, A.10 tailwheel, A.11 high altitude, A.12 towing glider, A.13 formation flight, A.14 flight review, A.15 IPC, A.16 recommendation for written, A.17 recommendation for practical, B.1-B.11 etc. per AC 61-65J).
  - Columns: `id`, `code` (AC 61-65 section code), `title`, `body_template markdown` with placeholders like `{{student_name}}`, `{{student_cert_number}}`, `{{aircraft_make_model}}`, `{{date}}`, `{{instructor_name}}`, `{{instructor_cfi_number}}`, `{{instructor_cfi_expiration}}`, `category` enum (`student_pilot | solo | xc | aircraft_class_rating | flight_review | ipc | practical_test | knowledge_test | other`), `ac_reference` (string like "AC 61-65J, A.5"), `deleted_at`.
- **`student_endorsement` per-issuance rows:** `id`, `school_id`, `base_id`, `student_user_id`, `template_id` (FK, nullable — null allowed for custom free-form endorsements with reason), `rendered_text` (the fully-substituted text, SNAPSHOTTED at sign-time — not re-rendered later), `issued_at`, `issued_by_user_id`, `signer_snapshot jsonb`, `expires_at` (nullable — e.g. flight reviews), `aircraft_context` (nullable — for solo endorsements scoped to a specific aircraft make/model), `notes`, `sealed` boolean + seal trigger, audit.
- **Issuing flow:** instructor picks student → picks endorsement template → system pre-fills placeholders from student profile + instructor profile + today's date → instructor reviews + adjusts if needed → clicks "Sign" → row created with rendered_text + signer snapshot + sealed=true. Endorsement appears in student training record and is optionally linked to a stage check if context matches.
- **Display on student profile:** chronological list with status (current / expired / revoked).

### Student currency tracking (SYL-12, SCH-12)

- **Reuse the Phase 2 `instructor_currency` pattern with a `subject_kind` discriminator.**
  - Migration: rename `instructor_currency` → `personnel_currency`. Add `subject_kind` enum column (`instructor | student`).
  - Extend the `currency_kind` enum with student kinds: `medical_class_1`, `medical_class_2`, `medical_class_3`, `basicmed`, `flight_review` (aka BFR), `ipc`, `solo_endorsement_scope`, `day_passenger_currency`, `night_passenger_currency`, `instrument_currency`, `tailwheel_currency`, `high_performance_currency`, `complex_currency`.
  - Same `currency_status(expires_at, warning_days)` SQL function from Phase 2 — no new status logic needed.
  - Same `warning_days` per-kind config via `currency_kind_config` table (seed student-kind defaults: medical 30d, BFR 60d, IPC 60d, solo 90d, night 30d).
- **Auto-derived currencies** (night passenger, day passenger, instrument 6HIT) can be computed from `flight_log_time` rows via a SQL function `compute_recency_currency(user_id, kind) returns record(last_qualifying_event timestamptz, expires_at timestamptz)`. For v1, the function is read-only (on demand when the profile page loads); Phase 8 will cache.
- **Manual currencies** (medical, BFR, IPC, solo scope) are entered by admin or instructor via the student profile (same UI pattern as the Phase 2 `CurrenciesPanel` used for instructors). Add a `StudentCurrenciesPanel` that reuses most of that component.
- **SCH-12 enablement:** Phase 5 exposes a `schedule.checkStudentCurrency(lessonId, studentUserId) returns { blockers: [...] }` tRPC procedure that reads the enrolled course_version's lesson, checks its `required_currencies` field against the student's `personnel_currency` rows, and returns a list of missing/expired currencies. Phase 3 scheduling UI wires this into the approve flow (adds a new validation step). The existing SCH-12 checklist item in REQUIREMENTS.md gets checked.
- **Lesson `required_currencies` field:** add `lesson.required_currencies jsonb` column — an array of currency_kind values that the student must hold (current, not expired) to be scheduled. Phase 6 rules engine will expand this, but Phase 5 ships the column and the check.

### Flight time categorization (STU-03, IACRA export)

- **`flight_log_time` table** — per-flight time splits into 14 CFR 61.51(e) buckets. Created at close-out (Phase 3 close-out form extended).
  - Columns: `id`, `reservation_id` (FK), `flight_log_entry_id` (FK to the `flight_in` row — links back to the Phase 2/3 paired-entry model), `user_id` (pilot — not necessarily the student, supports instructor solo flights too), `kind` enum (`dual_received | dual_given | pic | sic | solo`), `day_minutes`, `night_minutes`, `cross_country_minutes`, `instrument_actual_minutes`, `instrument_simulated_minutes`, `time_in_make_model text`, `day_landings int`, `night_landings int`, `notes`, audit.
- **Invariant:** `day_minutes + night_minutes` for a single row should equal the Hobbs time for the paired flight_log_entry minus ground_delay (if any). Enforced by CHECK constraint with tolerance, not strict equality (Hobbs rounds to 0.1 hr = 6 min, so allow ±6 min).
- **Multiple rows per flight** when appropriate: e.g. a student gets 1.2 dual_received; the instructor simultaneously logs 1.2 dual_given PIC. Two rows, same flight.
- **Close-out form UI:** inline section on `/dispatch/close/[id]` — instructor enters day/night split, XC boolean, instrument conditions, landings. UI pre-fills with sensible defaults (e.g. all-day if scheduled during daylight; 0 night; full Hobbs as dual_received if reservation has instructor+student).
- **Flight log totals** for a user = `SUM(...)` queries over `flight_log_time` grouped by `kind` / `day_vs_night` / etc. A view `user_flight_log_totals` materializes the common totals (PIC, dual received, solo, XC, night, instrument actual, instrument simulated, landings day/night, total time). `WITH (security_invoker = true)` so RLS flows through.

### 141.101 training record PDF export (SYL-10)

- **One PDF per (student, course_version).** Route: `/admin/students/[id]/courses/[enrollment_id]/record/export.pdf` (Route Handler) and `/record/courses/[enrollment_id]/export.pdf` (student self-serve).
- **Structure matches 14 CFR 141.101(a)(2):** (a) student identification (name, student cert number, address, date of birth), (b) course identification (title, rating sought, course version, enrollment/completion dates), (c) **chronological log** — one row per lesson grade sheet + stage check + endorsement, sorted by `conducted_at`, showing date / subject / ground hours / flight hours / instructor name + cert / brief remarks, (d) test records (knowledge test, end-of-stage tests, practical), (e) endorsements issued, (f) stage checks conducted, (g) chief instructor attestation on graduation (if enrollment.status='completed'). Internal template comments can reference "14 CFR 141.101(a)(2)"; **user-facing labels must NOT say "Part 141" or "approved"** — use "Training Record" + "Issued to" as the title and headings.
- **Library:** `@react-pdf/renderer` — proven in Phase 4. No fallback needed.
- **Signer snapshots rendered inline** from the captured JSONB (never re-looked-up). Same integrity contract as Phase 4.
- **Append-only — re-exports are idempotent.** Each PDF generation reads sealed rows only; draft grade sheets are excluded. Regenerating the PDF next week reflects only new sealed entries, never modifies historical rendering.

### IACRA hours summary export (SYL-11)

- **PDF + CSV both.** Route: `/admin/students/[id]/iacra/export.pdf` and `.../export.csv`, plus student self-serve equivalents.
- **Content:** totals by 61.51(e) category, broken out exactly as IACRA asks for on the 8710-1:
  - Total time
  - PIC time (with XC, night, instrument subtotals)
  - Solo time
  - Dual received (with XC, night, instrument subtotals)
  - SIC time (if any)
  - Cross-country (50nm / 25nm / with landings away from base of departure)
  - Night time
  - Night landings
  - Day landings
  - Instrument actual
  - Instrument simulated (hood time)
  - Time in make/model (aggregated by the `time_in_make_model` text field; admin reviews)
- **Not an IACRA API integration** — no direct submission. The instructor copy-pastes from the CSV into the IACRA form, or prints the PDF and transcribes.
- **Route uses the `user_flight_log_totals` view** for the numbers.

### Seed templates (SYL-02)

- **Three seeded courses** derived from publicly-available TCOs:
  - **Private Pilot (PPL)** — 3 stages, ~25 lessons, ~120 line items
  - **Instrument Rating (IR)** — 3 stages, ~20 lessons, ~100 line items
  - **Commercial Single-Engine (Comm SEL)** — 3 stages, ~18 lessons, ~90 line items
- **Sources to reference in research:**
  - Louisiana Tech University published PPL/IR/Comm TCOs (cited in Phase 0 project research as Tier 1)
  - Auburn University School of Aviation — any publicly-available syllabus materials
  - University of Alabama Aviation program — any publicly-available syllabus materials
  - FAA Airman Certification Standards (ACS) — PPL-A, IR-A, Comm-A — used to name line items and sanity-check coverage (the ACS areas of operation / tasks map naturally to Stages / Lessons / Line Items)
- **Quality bar:** seeds are "minimum viable starting point" not "comprehensive FAA-certified course." Explicitly labeled in the template description as derived-from-public-materials. Partner school is expected to fork and customize before using in production.
- **Seeded as `school_id = NULL`** (global catalog) in migration `0014_phase5_seed_courses.sql`. `course_version.grading_scale = 'absolute_ipm'` for all three (most common in Part 141 world).
- **Fork flow:** admin visits `/admin/courses`, clicks a template, picks "Fork to school," supplies a new code/title, and the `clone_course_version` function deep-copies the tree under the school's school_id with a fresh `course_version.published_at = null` (draft state).

### Student-facing training record + flight log (STU-02, STU-03)

- **Routes (scoped to the caller's own user_id):**
  - `/record` — student's training record dashboard. Lists current enrollment, progress (stage completion), recent grade sheets, pending stage checks, current endorsements, currency status chips.
  - `/record/courses/[enrollment_id]` — per-enrollment detail. Chronological grade sheets, endorsements for this course, stage checks, "Download 141.101 PDF" button.
  - `/flight-log` — chronological flight log from `flight_log_time` rows, grouped by month, with running totals. "Download IACRA PDF" + "Download IACRA CSV" buttons.
- **Read-only.** No edit controls. Student cannot modify grades, add hours, or delete entries. Server enforces via tRPC scoping queries to `where user_id = ctx.session.userId`.
- **Sealed entries shown with a lock icon** to visually communicate they're immutable.
- **Under `(app)` route group** so the Phase 1 protected layout applies.

### tRPC router additions

- `admin.courses.*` — CRUD on courses, course_versions (draft/publish), stages, phases, units, lessons, line_items. Gated by `adminOrChiefInstructorProcedure` (new composed procedure; chief instructor = instructor role + a new `is_chief_instructor` flag on `user_roles`).
- `admin.enrollments.*` — enroll student into course_version, migrate enrollment, mark complete/withdrawn.
- `admin.stageChecks.*` — schedule, record, seal.
- `admin.endorsements.*` — list templates, issue student endorsement, revoke (soft — Phase 4 snapshot contract means revocation adds a `revoked_at`, doesn't delete).
- `admin.students.currencies.*` — extends the Phase 2 `people.currencies.*` router for student subject_kind.
- `gradeSheet.*` — create from reservation, add/update/remove line_item_grade rows while draft, seal. Mirror of `dispatch.closeOut` pattern.
- `flightLog.categorize` — at close-out, write the `flight_log_time` rows. Called from the close-out form.
- `record.*` — student-facing read-only queries (`me`, `myFlightLog`, `myCurrencies`, `myCourseProgress`).
- `schedule.checkStudentCurrency(lessonId, studentId)` — new procedure Phase 3 approve flow wires into.

### Admin UI pages

- `/admin/courses` — catalog (system templates + school courses) with "Fork" button
- `/admin/courses/[id]` — course detail + version list
- `/admin/courses/[id]/versions/[version_id]` — version editor (tree view with expand/collapse, inline edit when draft, locked when published)
- `/admin/courses/[id]/versions/[version_id]/lessons/[lesson_id]` — lesson editor with line items
- `/admin/enrollments` — list students by enrollment
- `/admin/students/[user_id]/record` — admin view of any student's training record
- `/admin/stage-checks` — scheduled + pending stage checks queue
- `/admin/endorsements` — endorsement template catalog (+seed button for AC 61-65) + recently issued
- `/admin/students/[user_id]/courses/[enrollment_id]/record.pdf` — 141.101 PDF route
- `/admin/students/[user_id]/iacra.pdf` / `.csv` — IACRA export routes

### Banned-term caveat

- **FAA docs / CFR references are user-authored data or comments** — they can say "approved" or "Part 141" in body text stored in the DB (template definitions, admin descriptions). That's not source code.
- **Source-code strings in `apps/web/**`** still can't use banned terms. Display labels for grading scales, statuses, etc. live in `packages/domain/src/schemas/gradingLabels.ts` outside the lint glob, same as previous phases.
- **PDF template code** in `apps/web/app/.../record.pdf/route.ts` must NOT type "Part 141" or "approved" in JSX children. Use "Training Record" as the title. If the PDF needs to render "14 CFR 141.101" (which it should, for FAA-inspector legitimacy), that's allowed because it's the CFR citation, not one of the three banned phrases — but verify the lint rule doesn't trip on it.

### Claude's Discretion

- Exact tree-view UI component for course editing (recommend React component library or hand-built with CSS)
- Draft auto-save interval for grade sheets (10 seconds is a reasonable default)
- Whether the lesson picker at close-out is a dropdown, searchable combobox, or modal (research + UX judgment)
- Exact CFR section numbers displayed in the 141.101 PDF
- Color palette for grading scale chips
- Pagination cursor size on training record page
- Whether `clone_course_version` is a pure PL/pgSQL function or a server-side tRPC mutation that does a transaction
- PDF page size (Letter vs A4 — Letter recommended for US flight schools)
- Whether to pre-seed the AC 61-65 endorsement catalog in the same migration as the 3 courses, or a separate migration

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets (from Phases 1 + 2 + 3 + 4)

- **Phase 2 `person_profile`, `user_roles`, `instructor_currency`, `instructor_qualification`** — Phase 5 renames/extends. Migration plan: rename `instructor_currency` → `personnel_currency` + add `subject_kind` enum column + extend the currency_kind enum in a SEPARATE migration (per the Postgres enum-in-transaction caveat proven in Phases 2/3/4).
- **Phase 2 `student_course_enrollment`** minimal table with `course_descriptor` text — Phase 5 replaces with `course_version_id` FK via a migration that picks a default course_version for existing rows (or sets it null and marks them as "pre-syllabus imports").
- **Phase 2 `CurrenciesPanel`** component under `/admin/people/[id]/` — create a `StudentCurrenciesPanel` that reuses 80% of it with a `subjectKind='student'` prop
- **Phase 3 `reservation` table** — Phase 5 adds nullable `lesson_id` FK (replacing the `lesson_descriptor` text from Phase 3) + `student_enrollment_id` FK so the grade sheet at close-out knows which enrollment to write against
- **Phase 3 `/dispatch/close/[id]` close-out form** — the stubbed "Grade lesson" button becomes real. Add a lesson picker + line-item grading section inline.
- **Phase 3 `FlightLogEntryForm`** — already captures Hobbs/tach/squawks. Phase 5 adds the `flight_log_time` categorization section (dual/solo/PIC, day/night, XC, instrument, landings).
- **Phase 4 `logbook_entry` seal-on-sign trigger** — the pattern to mirror for `lesson_grade_sheet.sealed`, `stage_check.sealed`, `student_endorsement.sealed`, `course_version.published_at` (editing blocked when published).
- **Phase 4 `buildSignerSnapshot(ctx, requiredAuth)` helper** — reuse directly for grade-sheet sealing, stage-check sealing, endorsement signing. Required authority is always "instructor" (not mechanic_authority). Extend the helper or add `buildInstructorSignerSnapshot`.
- **Phase 4 `@react-pdf/renderer` pattern** — logbook PDF route is the template for the 141.101 training record PDF. Copy the route shape and page structure.
- **Phase 4 `is_airworthy_at` + Phase 3 `schedule.approve`** — the integration point for SCH-12. Phase 5 adds a server-side `checkStudentCurrency` call to the approve flow.
- **`packages/domain/src/schemas/` labels pattern** (`scheduleLabels.ts`, `maintenanceKindLabels.ts`) — mirror for `gradingLabels.ts`, `endorsementCategoryLabels.ts`, `lessonKindLabels.ts`.
- **`withTenantTx`** — every Phase 5 write routes through it. school_id + base_id GUCs set. New queries scope correctly.
- **`adminProcedure` / `mechanicOrAdminProcedure`** — add `adminOrChiefInstructorProcedure` and `instructorProcedure` composed procedures for Phase 5 writes.
- **Cross-tenant RLS test harness** — every new table gets a test, same pattern as Phases 1-4.

### Established Patterns

- **Schema-first, RLS-first** — every new table gets school_id + RLS + audit trigger + hard-delete blocker (where training-record-relevant) + cross-tenant test
- **Hand-authored migration mirrored to `supabase/migrations/`** — Phase 5 starts at `0014_*`. Each enum extension in its own migration file (Phase 2 lesson).
- **`pgPolicy` `to: 'authenticated'`** (string literal, NOT sql template)
- **Views with `WITH (security_invoker = true)`** for RLS flow-through
- **Signer snapshots copied into JSONB** at sign-time (Phase 4 integrity contract)
- **Seal-on-sign triggers** forbid UPDATE on sealed rows except for the sealing transition itself
- **User-facing strings centralized** in `packages/domain/src/schemas/*Labels.ts` outside banned-term lint glob

### Integration Points

- Phase 3 dispatch close-out form activates the "Grade lesson" button
- Phase 3 `schedule.approve` calls the new `checkStudentCurrency` procedure
- Phase 4 logbook PDF generation pattern → 141.101 PDF generation pattern (copy, adapt structure)
- Phase 6 (next phase) rules engine consumes `line_item.classification` (Required/Optional/Must Pass) + `lesson.required_currencies` + `student_course_enrollment.course_version_id` — Phase 5 establishes the schema Phase 6 queries
- Phase 8 (future) notifications will surface expiring student currencies using the same SQL pattern as Phase 8 will use for maintenance forecasts

</code_context>

<specifics>
## Specific Ideas

- The training record PDF should look like a professional document an FAA inspector wouldn't blink at — clean header with school logo (if provided), student photo (if provided), student identification block, chronological entries with readable typography, and a clear chief instructor attestation block at the end on graduation
- The grade sheet UI at close-out should feel like filling out the ACS — not a spreadsheet, but a structured page where each line item has room for a grade chip + a remarks field + the objectives/completion-standards text visible (not hidden in a tooltip)
- Stage checks should feel important and ceremonial — different visual treatment from a normal lesson, explicit "I certify this student has passed stage X" sign-off block
- The student training record view should feel empowering — students should be able to see exactly where they stand, what they've completed, what's next, and print their own records on demand. A well-designed `/record` page is a huge retention feature
- Endorsement issuance should show the fully-rendered text BEFORE sign-off — instructor confirms the wording is correct, then signs. Matches how paper endorsements work
- Seeded course templates should cite their source in the description ("Derived from publicly-available Louisiana Tech / Auburn University / FAA ACS materials") to set expectations that schools will fork + customize

</specifics>

<deferred>
## Deferred Ideas

- **Progression engine / incomplete line item rollover / prerequisite enforcement** — Phase 6 (explicitly out of scope for Phase 5)
- **Management override / authorized repeats / nightly training-record audit** — Phase 6
- **Ahead/behind plan indicator + projected checkride/completion date** — Phase 6
- **Automated IACRA form submission** — out of scope per PROJECT.md (copy-paste from our CSV into IACRA is the workflow)
- **DPE scheduling + practical-test record exchange** — Phase 6 / v2
- **Email/push notification of currency expiry** — Phase 8
- **Student goal-setting + study plan generator** — v2
- **AI-authored grades or AI remarks suggestions** — out of scope per PROJECT.md (pedagogical/liability concerns)
- **Video attachment of maneuvers on grade sheets** — v2
- **Importing historical training records from paper** — v2 migration phase
- **Integration with knowledge test providers (PSI, LaserGrade)** — v2
- **Syllabus template marketplace / sharing between schools** — v2
- **Rich text editing in line item descriptions beyond plain markdown** — v2
- **Grade-sheet comments/discussion thread with student** — v2
- **Photo upload for student (for the 141.101 PDF header)** — v2, reuses Phase 1 documents flow
- **Chief instructor signature image** — v2 (v1 uses typed signer snapshot)
- **Auto-generation of graduation attestation** — Phase 6

</deferred>

---

_Phase: 05-syllabus-model-grading-records_
_Context gathered: 2026-04-09_
