# Phase 3: Scheduling & Dispatch Execution - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Give the school a real-time flight-line operating system: reservations across all activity types with DB-level no-double-book, a maintenance-aware dispatch gate (stubbed on grounded+squawks for now), calendar UI, a dispatch screen that runs the day, overdue alarms, cross-country flight following, passenger manifests, Flight Information File acknowledgement, and a flight close-out workflow that writes back into the Phase 2 flight log + audit trail.

Phase 3 does NOT ship: real maintenance/inspection/AD tracking (Phase 4 replaces the `isAirworthyAt` stub), syllabus grading tied to lessons (Phase 5), currency/qualification scheduling gates (Phase 6 — the rules engine), ADS-B live position overlay (Phase 7 — consumes the XC fields defined here), email/push notifications (Phase 8).

Covers requirements: SCH-01, SCH-02, SCH-03, SCH-04, SCH-06, SCH-07, SCH-08, SCH-09, SCH-13, SCH-15, SCH-16, SCH-17, SCH-18, INS-04, FLT-04, FTR-01, FTR-02, FTR-03, FTR-04, FTR-05, FTR-06, FTR-07, FTR-08.

</domain>

<decisions>
## Implementation Decisions

### Reservation data model (SCH-01, SCH-02, SCH-13)

- **Single `reservation` table** with an `activity_type` enum: `flight | simulator | oral | academic | misc`. One table, one `time_range tstzrange` column, one set of `EXCLUDE USING gist` constraints gates every activity type uniformly.
- Columns: `id`, `school_id`, `base_id`, `activity_type`, `time_range tstzrange NOT NULL`, `status` enum (`requested | approved | dispatched | flown | closed | cancelled | no_show | scrubbed`), `aircraft_id` (nullable — null for oral/academic/misc), `instructor_id` (nullable — null for solo or self-study), `student_id` (nullable — null for instructor-only activities or blocks without an assigned student), `room_id` (nullable — present for oral/academic), `series_id` uuid (null unless part of a recurring series), `parent_block_id` uuid (null unless booked into an admin-defined block), `notes`, `requested_at`, `requested_by`, `approved_at`, `approved_by`, `dispatched_at`, `dispatched_by`, `closed_at`, `closed_by`, `close_out_reason`, `deleted_at`.
- `time_range` is `tstzrange` with `'[)'` bounds (half-open) so adjacent reservations (one ends exactly when the next starts) do NOT conflict.
- Audit trigger attached. Hard-delete blocker attached. RLS on school_id + base_id.

### Conflict-check constraints (SCH-02)

**Four exclusion constraints on the `reservation` table, each gated by an index expression that only checks confirmed reservations:**

```sql
create extension if not exists btree_gist;

-- Aircraft cannot double-book when reservation is in an active state
alter table public.reservation add constraint reservation_aircraft_no_overlap
  exclude using gist (
    aircraft_id with =,
    time_range with &&
  ) where (aircraft_id is not null and status in ('approved','dispatched','flown'));

-- Same for instructor
alter table public.reservation add constraint reservation_instructor_no_overlap
  exclude using gist (
    instructor_id with =,
    time_range with &&
  ) where (instructor_id is not null and status in ('approved','dispatched','flown'));

-- Same for student
alter table public.reservation add constraint reservation_student_no_overlap
  exclude using gist (
    student_id with =,
    time_range with &&
  ) where (student_id is not null and status in ('approved','dispatched','flown'));

-- Same for room
alter table public.reservation add constraint reservation_room_no_overlap
  exclude using gist (
    room_id with =,
    time_range with &&
  ) where (room_id is not null and status in ('approved','dispatched','flown'));
```

- Pending (`requested`) reservations do NOT participate in conflict-check — they can overlap with each other and with existing confirmed reservations. The approval step is what enforces the constraint, so the approver gets an immediate error if it would collide.
- Cancelled / no-show / scrubbed reservations drop out of the constraint automatically via the WHERE clause.
- `series_id` is purely organizational — each child of a recurring series conflict-checks independently.

**Personnel unavailability (SCH-15) participates in the same check via a view + trigger, OR via shadow rows:**

- **Chosen: shadow rows.** `person_unavailability` (from Phase 2 if it exists, else created here) gets a `BEFORE INSERT` trigger that also inserts a `reservation` row with `activity_type='misc'`, `status='approved'`, `instructor_id` or `student_id` set, and `notes='unavailable: <reason>'`. Blocks the person from being scheduled via the same exclusion constraint. Cleaner than writing a second conflict path.
- If the `person_unavailability` table doesn't exist yet from Phase 2, Phase 3 creates it: `id`, `user_id`, `school_id`, `time_range tstzrange`, `reason`, `kind` enum (`vacation | sick | personal | training | other`), `created_at`, `created_by`.

### Recurring reservations (SCH-06)

- **Materialize child rows at creation time.** Creation form accepts: `frequency` (daily / weekly), `days_of_week` (bitmask), `until_date`, or `occurrence_count`. Server expands to N concrete `reservation` rows with a shared `series_id` uuid.
- Each child row conflict-checks independently. If any child fails the exclusion constraint, the whole series creation rolls back with an error naming the conflicting instance.
- Editing a series:
  - **"This occurrence only"** → edit the single row (series stays linked)
  - **"This and following"** → delete future rows in the series, insert replacements, `series_id` preserved
  - **"Entire series"** → bulk update by `series_id`
- Cancelling a single instance doesn't affect siblings.
- No RRULE / iCalendar interop in v1.

### Block scheduling (SCH-16)

- **Admin pre-defines blocks, students book into slots.**
- `schedule_block` table: `id`, `school_id`, `base_id`, `instructor_id` (nullable), `aircraft_id` (nullable), `room_id` (nullable), `time_range tstzrange NOT NULL`, `recurrence_rule jsonb` (day-of-week + time range, simpler than full RRULE), `valid_from`, `valid_until`, `kind` enum (`instructor_block | aircraft_block | room_block | combo`), `notes`.
- `schedule_block_instance` materialized rows generated at creation (same pattern as recurring reservations). Students book by creating a `reservation` with `parent_block_id = <instance_id>`. A trigger inflates `reservation.instructor_id` / `aircraft_id` / `room_id` from the parent block if they're null on insert.
- Admin UI at `/admin/blocks` (list, create, edit, delete) — similar pattern to aircraft/people.
- Student schedule page at `/schedule` shows a grid with free block slots highlighted; clicking requests a reservation.
- Conflict-checking: block instances are NOT rows in `reservation`, so they don't block each other or get counted. They exist only to provide a bookable slot. The reservation created from the block still flows through the normal exclusion constraint.

### `isAirworthyAt()` stub (SCH-04, FLT-04)

- **Phase 3 stub:** SQL function `public.is_airworthy_at(aircraft_id uuid, at timestamptz) returns boolean` that returns `false` if:
  - `aircraft.deleted_at is not null`, OR
  - `aircraft.grounded_at is not null AND aircraft.grounded_at <= at`, OR
  - There exists any `aircraft_squawk` row with `severity='grounding'` and `opened_at <= at` and (`resolved_at is null` or `resolved_at > at`)
- Phase 3 creates a minimal `aircraft_squawk` table so the squawk path has somewhere to write: `id`, `school_id`, `base_id`, `aircraft_id`, `severity` enum (`info | watch | grounding`), `title`, `description`, `opened_at`, `opened_by`, `resolved_at`, `resolved_by`, `resolution_notes`. Phase 4 CAMP will extend it significantly.
- Reservation server guard calls `is_airworthy_at(aircraft_id, time_range.start)` on approve and on dispatch. Failing either raises a user-visible error.
- Phase 4 replaces the function body without changing the signature — zero app-code churn.

### Calendar UI (SCH-07, SCH-17)

- **FullCalendar React** (`@fullcalendar/react` + `@fullcalendar/resource-timeline` + `@fullcalendar/timegrid` + `@fullcalendar/daygrid`). MIT core; the resource-timeline plugin is also MIT under @fullcalendar/resource-timeline (previously premium; verify at install time — if not MIT, fall back to the free timegrid + a simple per-resource column layout).
- Views:
  - **By aircraft** (resource timeline rows = aircraft, columns = time)
  - **By instructor** (resource timeline rows = instructors)
  - **By student** (single lane, student's own reservations)
  - **By room** (resource timeline rows = rooms)
  - **Day / Week / Month** (time grid)
- Visual differentiation by `activity_type` with color chips: flight=blue, simulator=purple, oral=orange, academic=green, misc=gray. Status affects opacity (`requested`=dashed outline, `approved`=solid, `dispatched`=bold outline, `flown`=check icon, `cancelled/no_show/scrubbed`=strikethrough).
- Student default view: "My reservations" (their own only).
- Instructor default view: "My reservations" + "Today's fleet" toggle.
- Admin default view: "By aircraft" for the active base.
- Click an event → opens a detail drawer with edit/cancel/approve actions.
- Click an empty slot → opens the new-reservation form pre-filled with start time.

### Schedule visibility (privacy-first, deviation from default)

- **Students see ONLY their own reservations + free-busy for aircraft/instructor they can book.**
  - `GET /schedule` for a student calls a tRPC procedure that returns: (a) the student's own reservation rows, (b) a redacted free/busy view of other reservations on resources the student has permission to book (just `time_range` + `resource_id`, no names or details).
  - Free/busy comes from a SQL function `public.free_busy(resource_type text, resource_id uuid, from_ts timestamptz, to_ts timestamptz) returns setof tstzrange`.
- Instructors and admins see full reservation details for their base.
- Implementation: tRPC `schedule.list` accepts a `mode` ('mine' | 'full' | 'freebusy') and the server decides what the caller is allowed to see based on their role, not the UI.

### Dispatch screen (FTR-01, FTR-02, FTR-03, FTR-04)

- Route: `/dispatch` (behind `instructorOrAdminProcedure` server guard).
- Three panels:
  1. **Currently flying** — all reservations where `status='dispatched'`. Shows aircraft tail, student, instructor, dispatched-at, expected-end, current overage (green if on time, yellow if close, red if overdue).
  2. **About to fly** — reservations where `status='approved'` and `time_range.start` is within the next 60 minutes. Shows the same with a "Dispatch" button.
  3. **Recently closed** — reservations where `status='closed'` in the last 2 hours. Collapsed by default.
- **Refresh:** tRPC query polling at 15s via TanStack Query `refetchInterval`. No Supabase Realtime in Phase 3 (deferred to Phase 8 polish).
- **Overdue detection:** a reservation is overdue when `now() > time_range.end + grace_window` and `status='dispatched'`. Default grace window: 30 minutes; school-configurable.
- **Overdue alarm UI (FTR-04):**
  - Row turns red
  - Audio cue plays when a NEW overdue appears (client-side tracks already-seen set in sessionStorage)
  - In-app notification to duty instructor + admin (NOT email — that's Phase 8)
- **Dispatch action (FTR-02, FTR-03):**
  - Click "Dispatch" on an approved reservation → opens a modal
  - Modal requires: electronic student check-in (student clicks "I'm here" from their own UI OR dispatcher marks "student present"), electronic instructor authorization (instructor clicks "I authorize this release"), aircraft Hobbs-out + tach-out
  - Submitting the modal writes a `flight_log_entry` row (kind='flight', hobbs_out, tach_out, null for the in-values) AND transitions reservation status to `dispatched`.
- **Non-flight dispatch:** simulator/oral/academic dispatch skips the Hobbs/tach step but still requires the student present + instructor authorization ticks.

### Electronic student check-in (FTR-02)

- Student-facing: a "Check in" button appears on their own reservation card 15 minutes before start. Clicking it sets `reservation.student_checked_in_at = now()` and `reservation.student_checked_in_by = student_id`.
- Dispatcher-facing: dispatcher can also mark student present manually (in case the student forgets/refuses).
- Both paths fill the same columns.

### Instructor authorization / release (FTR-02)

- Instructor clicks "Authorize release" on the dispatch modal → sets `reservation.instructor_authorized_at` + `instructor_authorized_by`. This is the electronic equivalent of the CFI signing the dispatch sheet.
- Cannot proceed to `dispatched` without both student_checked_in_at AND instructor_authorized_at non-null.

### Aircraft check-out / check-in Hobbs capture (FTR-03)

- **At dispatch AND at close-out.** Two flight_log_entry rows per flight:
  - Row 1 (at dispatch, kind='flight_out'): hobbs_out, tach_out filled, hobbs_in/tach_in null
  - Row 2 (at close-out, kind='flight_in'): hobbs_in, tach_in filled, hobbs_out/tach_out null, `paired_entry_id` FK → row 1
- `aircraft_current_totals` view updated to handle the pair by summing `flight_in.hobbs_in - flight_out.hobbs_out` (delta), PLUS the existing baseline entries.
  - **Alternative:** single `flight_log_entry` row that gets UPDATED at close-out with the in values — rejected because the append-only contract from Phase 2 says no updates.
  - **Correct path:** Phase 2's flight_log_entry kind enum becomes `baseline | correction | flight_out | flight_in`. View sums properly.

**Migration for Phase 2 `flight_log_entry`:** add `flight_out | flight_in` to the kind enum; keep the old `flight` kind alive as a deprecated alias; the view handles both old-style single-entry flights (sum hobbs_in - hobbs_out) and new-style paired entries. Existing Phase 2 tests continue to pass.

### Flight close-out (SCH-08, SCH-09, INS-04, FTR-08)

- Route: `/dispatch/close/[reservation_id]` (linked from dispatch screen and from instructor's own "My active flights" list on their dashboard).
- Single-page form with these sections:
  - **Times:** Hobbs in, tach in (pre-filled estimates)
  - **Fuel / oil:** fuel added in gal, oil added in qt
  - **Route:** what was actually flown (free text, defaulted from the XC plan if set)
  - **Squawks observed:** 0..N squawks (title, description, severity). Each creates an `aircraft_squawk` row. Severity 'grounding' auto-grounds the aircraft for future reservations via the `isAirworthyAt` stub.
  - **Notes**
  - **Lesson grading link:** a placeholder button "Grade lesson" that is disabled in Phase 3 (enabled by Phase 5). Shows "Coming in Phase 5" tooltip. Reserved real estate only.
- Submitting:
  - Writes the `flight_log_entry kind='flight_in'` row
  - Creates any squawks
  - Transitions `reservation.status` to `closed`
  - Emits an audit log entry
- **Who can close out:** student OR instructor can fill the form. Instructor must sign off (click a "Sign off as instructor" button) for the reservation to move to `closed`. If a student saves without instructor sign-off, status becomes `pending_sign_off` (an additional intermediate state added to the enum).

### Cancellation windows (SCH-09)

- Enum states: `cancelled_free` (>24h before start), `cancelled_late` (<24h, but before start), `no_show` (after start, never closed), `scrubbed` (weather, no blame).
- Close-out reasons on the reservation: `cancelled_free | cancelled_late | no_show | scrubbed_weather | scrubbed_maintenance | scrubbed_other`.
- `no_show` automatically writes a row to the Phase 2 `no_show` table (PER-07 integration).
- `scrubbed_*` states do not count against the student.
- `cancelled_late` is captured and displayed but has no automatic penalty in v1 (v2 BIL phase adds fee logic).
- Transition rules (server-enforced):
  - Any reservation can move from `requested` → `cancelled_free` / `cancelled_late` before `time_range.start`
  - Any reservation can move from `approved` → `cancelled_*` / `scrubbed_*`
  - After `time_range.start`, unreached reservations move to `no_show` (via dispatcher action OR a nightly sweep job — Phase 8 adds the sweep; Phase 3 ships the manual dispatcher action only)

### Rooms (SCH-18 partial)

- **`room` table**: `id`, `school_id`, `base_id`, `name`, `capacity`, `features` text[] (e.g. `{'projector','whiteboard','simulator_sim142'}`), `deleted_at`, audit attached.
- Admin CRUD at `/admin/rooms` — same table-list → detail pattern as aircraft.
- Rooms participate in the conflict exclusion constraint.

### XC flight following (FTR-05)

- On the reservation form, if `activity_type='flight'`, optional "Cross-country" toggle reveals:
  - `route_string` (text, e.g. `KXXX KAAA KBBB KXXX`)
  - `ete_minutes` (integer)
  - `stops` (text[] — intermediate airports)
  - `fuel_stops` (text[])
  - `alternate` (text)
- Columns added directly to `reservation` table as nullable fields.
- Phase 7 ADS-B overlay reads these fields to draw the planned track.
- No waypoint parsing, no wind calc, no fuel burn calc in v1.

### Passenger manifest (FTR-06)

- **Free text + weights + emergency contacts.** Pax do NOT need to be existing users.
- `passenger_manifest` table: `id`, `reservation_id`, `position` ('pic' | 'sic' | 'passenger' ordinal), `name`, `weight_lbs`, `emergency_contact_name`, `emergency_contact_phone`, `notes`.
- UI: panel in the dispatch modal for flight-type reservations. Pilot-in-command auto-filled from instructor/student depending on solo vs dual. Additional passengers added as rows.
- Print preview: `/dispatch/manifest/[reservation_id]` generates a print-friendly HTML page. No PDF generation in v1.

### Flight Information File (FTR-07)

- **Admin posts notices + pilot acks before dispatch.**
- `fif_notice` table: `id`, `school_id`, `base_id` (nullable — null means all bases), `title`, `body markdown`, `posted_at`, `posted_by`, `effective_at`, `expires_at` (nullable), `severity` enum (`info | important | critical`).
- `fif_acknowledgement` table: `id`, `notice_id`, `user_id`, `acknowledged_at`. Unique on (notice_id, user_id).
- Admin UI at `/admin/fif` to post, edit, revoke notices.
- Pilot UI: on the dispatch modal for a flight-type reservation, the modal blocks with "You have 3 unread FIF notices" and renders each one with a "I have read and understand" button. Only after all active notices are acknowledged does the "Dispatch" button enable.
- Active = `effective_at <= now() AND (expires_at is null OR expires_at > now())`.
- An acknowledgement is valid forever once made (until the notice expires or is revoked). No re-acks on edit in v1; if admin wants a re-ack, they post a new notice.

### Schedule routes (SCH-01, SCH-03, SCH-07)

- `/schedule` — student's own calendar + request form + free/busy widgets
- `/schedule/request` — explicit new-reservation form (also reachable via click-to-slot on the calendar)
- `/schedule/approvals` — instructor/admin queue of pending student requests
- `/schedule/[reservation_id]` — reservation detail + actions
- `/admin/schedule` — full-school calendar view for admin

### Dashboard changes

- Admin dashboard (`/admin/dashboard`) gets two new panels:
  - **Today's flight line** (deep-link to `/dispatch`)
  - **Pending approvals count**
- Instructor dashboard (in `/(app)/page.tsx` when active role is instructor) gets:
  - Today's schedule
  - Students assigned to me
  - Pending approvals waiting on me
- Student dashboard gets:
  - Next reservation
  - Unread FIF notices
  - Any open squawks on the aircraft they're scheduled on

### Claude's Discretion

- Exact FullCalendar plugin selection (verify @fullcalendar/resource-timeline license at install time; fall back to timegrid if premium)
- Time zone display (always use school timezone on the calendar, same pattern as Phase 1/2)
- Reservation form field ordering
- Audio cue file (use a simple beep; no third-party sound library)
- Exact grace-window default (30 min recommended; admin-configurable via `school.overdue_grace_minutes` column)
- Whether to use TanStack Query mutations + tRPC or Server Actions for the dispatch modal (tRPC recommended for type safety with the polling query)
- Print CSS for the passenger manifest
- Loading skeletons on the dispatch screen
- Whether `schedule_block_instance` is a materialized table or a generated-on-read view (materialize is simpler to conflict-check against; recommended)

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets (from Phases 1 + 2)

- **`packages/db/src/schema/`** — add new files: `reservations.ts`, `schedule_blocks.ts`, `rooms.ts`, `squawks.ts`, `fif.ts`, `passenger_manifest.ts`. Extend `aircraft.ts` (add `grounded_at nullable`) and `flight_log.ts` (extend kind enum).
- **Phase 2 `flight_log_entry` kind enum** — extend with `flight_out | flight_in` (keep `flight` as deprecated alias). Update the `aircraft_current_totals` view to handle the new kinds in a new migration.
- **`audit.attach('table_name')`** applied to every new safety-relevant table: reservation, passenger_manifest, flight_log_entry (already), aircraft_squawk, fif_notice, fif_acknowledgement.
- **`fn_block_hard_delete`** attached to reservation (soft-delete only — no hard-deleting flight records even when cancelled).
- **RLS pattern:** all tables scoped by `school_id` via `auth.jwt() ->> 'school_id'` policies, plus `base_id` where applicable via `current_setting('app.base_id', true)`.
- **Cross-tenant test harness:** every new table gets a test in `tests/rls/cross-tenant.test.ts`. Plus concurrent-insert test for the exclusion constraint (verify two parallel inserts of overlapping approved reservations fail on the second one).
- **`adminProcedure` / `protectedProcedure`** — reuse everywhere.
- **`withTenantTx`** — all scheduling mutations run through this so `SET LOCAL app.school_id` and `app.base_id` are always set.
- **Banned-term lint** — still strict. "Approved" as a reservation status is fine because it's a data value, not user-facing display text (display label will be "Confirmed" or similar to avoid the banned word in UI — plan should flag this).
- **Phase 2 `person_hold`** — `person_hold` is queried at reservation approval time to block held/grounded students/instructors.
- **Phase 2 `no_show` table** — receives rows when reservation closes as `no_show`.
- **Phase 2 `/admin/people/[id]/HoldsPanel`** — displays hold state; Phase 3 gates scheduling on this.

### Established Patterns

- **Schema-first:** every new table gets RLS + audit + cross-tenant test in the same migration.
- **Hand-authored SQL migration mirrored to `supabase/migrations/`** so `supabase db reset` re-applies everything.
- **Drizzle `pgPolicy` `to:` is a STRING, not `sql\`authenticated\``** — Phase 1 bug stays fixed.
- **Server-side role enforcement first.** UI hiding is cosmetic.
- **Views that flow RLS through:** `WITH (security_invoker = true)` — already proven in Phase 2 (aircraft_current_totals, aircraft_engine_current_totals).
- **Test harness uses raw postgres-js with `request.jwt.claims` GUC** — extend with helpers for creating reservations, running the exclusion check, etc.

### Integration Points

- Phase 4 will replace the `is_airworthy_at` function body (contract: same signature)
- Phase 5 will wire the "Grade lesson" button at flight close-out
- Phase 6 will add currency + qualification gates to the approve step (SCH-05, SCH-11, SCH-12, SCH-14)
- Phase 7 ADS-B will read `reservation.route_string / ete_minutes / stops` for flight-following overlay
- Phase 8 will add email notifications, nightly no-show sweeper, Supabase Realtime on dispatch

</code_context>

<specifics>
## Specific Ideas

- The dispatch screen is the school's day-of-work hub. It should feel tight and alive — dense but scannable. Prioritize information density over whitespace
- Every reservation detail view should show the audit trail (who requested, approved, dispatched, closed) — Phase 1 audit_log already captures it; this surfaces it
- FIF should feel like airline crew mailbox, not marketing newsletter. Short notices, clear "you must read this" intent
- Every dispatch action (check-in, authorize, Hobbs capture, close-out, squawk open) writes to audit_log via the trigger already in place
- Times always displayed to 1 decimal (matches Phase 2 display convention)
- Calendar colors locked to the activity_type, not configurable per school — keeps cross-school consistency if/when multi-tenant SaaS comes

</specifics>

<deferred>
## Deferred Ideas

- **Email / SMS notifications** — Phase 8 (NOT category)
- **Nightly no-show sweep job** — Phase 8
- **Supabase Realtime** on the dispatch screen — Phase 8 polish
- **Fee logic for late cancellations** — v2 (BIL category)
- **Waypoint parsing / wind calc / fuel burn for XC** — v2
- **PDF passenger manifest** — v2 (print-friendly HTML is enough for v1)
- **RRULE iCalendar export** — v2
- **Drag-to-reschedule on calendar** — nice-to-have, defer to Phase 8 if time permits
- **Mobile dispatcher app** — v2 mobile pillar
- **ForeFlight integration** — out of scope per PROJECT.md
- **Weather briefing at reservation time** — out of scope per PROJECT.md
- **Room booking from outside the school (conference rental)** — out of scope
- **Re-ack on FIF notice edit** — v2

</deferred>

---

_Phase: 03-scheduling-dispatch-execution_
_Context gathered: 2026-04-08_
