# Roadmap: Part 61 School

**Created:** 2026-04-06
**Revised:** 2026-04-06
**Depth:** Standard
**Phases:** 8
**Coverage:** 136/136 v1 requirements mapped

## Core Value

Give a Part 61 school a single source of truth for fleet, training, and scheduling so it can operate as professionally as a 141 school. All four pillars (scheduling, maintenance, syllabus, ADS-B) must work cohesively in v1, with full personnel management, dispatch execution, and performance monitoring layered in.

## Phases

- [x] **Phase 1: Foundation & Terminology Contract** - Multi-tenant RLS, auth, audit scaffolding, banned-term lint, document storage (completed 2026-04-07)
- [x] **Phase 2: Personnel, Admin & Fleet Primitives** - People (bio/emergency/holds/history), instructor currencies+quals, multi-base scoping, multi-clock aircraft, admin CRUD (completed 2026-04-08)
- [x] **Phase 3: Scheduling & Dispatch Execution** - Reservations with DB-level conflict prevention, multi-activity-type scheduling, dispatch screen, check-in/out, overdue alerts, XC following, FIF, flight close-out (completed 2026-04-08)
- [x] **Phase 4: CAMP Maintenance** - Real `isAirworthyAt`, inspections, ADs, squawks, work orders, parts, logbook export, downtime prediction (completed 2026-04-09)
- [ ] **Phase 5: Syllabus Model, Grading & Records** - Course→Stage→Phase→Unit→Lesson→LineItem hierarchy, seeded templates, versioning, grading, stage checks, endorsements, 141.101 + IACRA exports, test grades
- [ ] **Phase 6: Syllabus Rules, Progression & Audit** - Required/Optional/Must-Pass, auto-rollover, prerequisite+currency enforcement, mgmt override, rules engine, course minimums, ahead/behind, projected completion, nightly audit, ETA next-activity
- [ ] **Phase 7: ADS-B Fleet Integration** - Integrate existing ADS-B Tracker service: live fleet map, deep-links, geofence, flight replay
- [ ] **Phase 8: Experience, Reporting, Messaging & Beta** - Role dashboards, notifications, full audit log, cost tracking, standard reports, IM/broadcast, dispatch cues, multi-base reporting, beta hardening

## Phase Details

### Phase 1: Foundation & Terminology Contract

**Goal**: Safety-relevant, multi-tenant-ready platform foundation that cannot be retrofitted later.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08
**Success Criteria** (what must be TRUE):

1. A user can sign up, verify email, log in, stay logged in across refresh, and log out; session is bound to a `school_id` claim
2. Any attempt to read or write data from another school's tenant fails at the database level (verified by an automated cross-tenant RLS test harness)
3. Four roles exist (Student, Instructor, Mechanic with A&P/IA designation, Admin); role checks are enforced server-side, not only in the UI; users may hold multiple roles
4. Every mutation to a safety-relevant table writes an append-only audit row recording who, what, when, and prior value; hard-delete is impossible on training/maintenance records
5. CI fails any PR that introduces the banned terms ("Part 141", "approved", "certified course") in user-facing UI or export templates
6. A user can upload a document (medical, license, insurance) to their profile and retrieve it via a signed URL, with an expiration date captured
   **Plans:** 3/4 plans complete
   Plans:

- [ ] 01-01-PLAN.md — Monorepo bootstrap + banned-term ESLint rule + Husky + CI skeleton
- [x] 01-02-PLAN.md — Drizzle schema, audit triggers, RLS policies, custom access token hook, cross-tenant Vitest harness
- [ ] 01-03-PLAN.md — tRPC server (auth/tenant/role middleware), Supabase SSR auth, admin-invite flow, active-role switcher, protected dashboard
- [ ] 01-04-PLAN.md — Document storage: bucket RLS, tRPC documents router, upload/download UI, final Phase 1 verification

### Phase 2: Personnel, Admin & Fleet Primitives

**Goal**: People and aircraft exist as first-class records with the biographic, currency, qualification, multi-base, and multi-clock structure every downstream pillar depends on.
**Depends on**: Phase 1
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, FLT-01, FLT-02, FLT-03, FLT-05, FLT-06, PER-01, PER-02, PER-03, PER-04, PER-05, PER-06, PER-07, PER-08, PER-09, PER-10, IPF-01, IPF-02, MUL-01, MUL-02
**Success Criteria** (what must be TRUE):

1. An admin can create, edit, and soft-delete students, instructors, mechanics (with A&P/IA designation), rental customers, and aircraft; roles can be assigned and changed on any user
2. Every personnel record carries full biographic and demographic data (name, DOB, address, phone, email, FAA airman cert, citizenship status for TSA AFSP), emergency contact, and information-release authorizations, all visible from the profile
3. Self-registration works with an admin approval queue (configurable per school); a student can be placed on hold or grounded and an instructor can be grounded, both with reason captured and gate behavior confirmed by downstream scheduling
4. Instructor profile shows tracked currencies (CFI, CFII, MEI, medical, BFR, IPC) with expiration auto-warnings, qualifications (aircraft type, sim authorizations, course authorizations), and flight experience history; student profile shows no-show history and enrolled/past courses
5. Each aircraft carries independent Hobbs, tach, airframe, and per-engine time series; current totals are computed as queries over an append-only `flight_log_entry` event log, never as a mutable column; aircraft profile shows totals, equipment, recent flights
6. Aircraft, instructors, and rooms are scoped to a training base; a user with roles at multiple bases can switch active base context; admin dashboard shows fleet status at a glance for the active base
   **Plans:** 4/4 plans complete
   Plans:

- [ ] 02-01-PLAN.md — Drizzle schema, hand-authored migration, RLS policies, audit + append-only triggers, aircraft_current_totals view, cross-tenant tests
- [ ] 02-02-PLAN.md — Tenant context extension (app.base_id), tRPC context + layout cookie plumbing, access token hook status guard
- [ ] 02-03-PLAN.md — tRPC routers (admin/people, admin/aircraft, admin/school, admin/dashboard, people sub-routers, flightLog, register, documents.uploadAircraftPhoto)
- [ ] 02-04-PLAN.md — Admin UI (people, aircraft, dashboard, school), /register public page, BaseSwitcher, end-of-phase live verification

### Phase 3: Scheduling & Dispatch Execution

**Goal**: Students can be scheduled across all activity types and the school can run its flight line in real time — double-booking, flying a grounded aircraft, and losing track of an airborne aircraft are all structurally impossible.
**Depends on**: Phase 2
**Requirements**: SCH-01, SCH-02, SCH-03, SCH-04, SCH-06, SCH-07, SCH-08, SCH-09, SCH-13, SCH-15, SCH-16, SCH-17, SCH-18, INS-04, FLT-04, FTR-01, FTR-02, FTR-03, FTR-04, FTR-05, FTR-06, FTR-07, FTR-08
**Success Criteria** (what must be TRUE):

1. A student can request a reservation across any schedulable activity type (flight, sim, oral, academic/ground, misc); an instructor or admin must approve before it is confirmed; recurring reservations and pre-defined block slots are supported
2. Two overlapping confirmed reservations on the same aircraft, instructor, student, or room are rejected by a Postgres `EXCLUDE USING gist` constraint on `tstzrange` (verified by a concurrent-insert test); personnel unavailability (vacation, sick) participates in the same conflict check
3. A reservation cannot be confirmed for an aircraft whose `isAirworthyAt(reservation_start)` is false (initially stubbed on grounded flag; Phase 4 replaces the stub); calendar views exist by aircraft, instructor, student, room, day/week/month, with visual differentiation of activity types
4. A dispatch screen shows what is currently flying, about to fly, and overdue — color-coded — and captures electronic student check-in, instructor electronic authorization (release), and aircraft check-out/in with Hobbs/tach snapshots
5. An overdue aircraft (past expected end + grace) raises an alarm on dispatch and notifies duty instructor/admin; XC flights can record planned route, ETE, and intermediate stops (ready to bind to Phase 7 ADS-B), passenger manifest is captured with weights and emergency contacts, and a Flight Information File requires sign-off acknowledgement before dispatch
6. A reservation moves through requested → approved → dispatched → flown → closed → archived with distinct reasoned close-out states (no-show, weather scrub, cancellation); flight close-out consolidates Hobbs/tach in, fuel/oil, route, squawks observed, and a handoff to line-item grading in a single screen
   **Plans:** 5/5 plans complete
   Plans:

- [ ] 03-01-PLAN.md — Phase 3 schema, migration, exclusion constraints, is_airworthy_at stub, shadow-row trigger, RLS + concurrency tests
- [ ] 03-02-PLAN.md — tRPC routers: schedule, dispatch, fif, admin rooms + squawks + integration tests
- [ ] 03-03-PLAN.md — Calendar UI + reservation form + approvals + admin schedule/rooms/blocks
- [ ] 03-04-PLAN.md — Dispatch screen + modal + overdue alarm + close-out form + passenger manifest
- [ ] 03-05-PLAN.md — FIF admin UI + dashboard FIF inbox + end-of-phase human verification

### Phase 4: CAMP Maintenance

**Goal**: The aircraft the schedule says are airworthy actually are, with FAA-inspection-ready records behind every claim.
**Depends on**: Phase 3
**Requirements**: MNT-01, MNT-02, MNT-03, MNT-04, MNT-05, MNT-06, MNT-07, MNT-08, MNT-09, MNT-10, MNT-11
**Success Criteria** (what must be TRUE):

1. Every maintenance item (100hr, annual, AD, oil, transponder, ELT, pitot-static, etc.) is typed and declares which clock (Hobbs / tach / airframe / calendar) its interval is measured against, and surfaces a deterministic "next due" date or hours
2. When an aircraft crosses any compliance limit, the system auto-grounds it; a confirmed reservation on a now-non-airworthy aircraft is flagged, and the only path to overfly is an explicit IA-recorded §91.409 10-hour overrun justification
3. A squawk can be opened by any user, triaged by a mechanic, ground the aircraft if severe, and be returned to service only by a qualified A&P or IA whose certificate type and number are snapshotted into the sign-off record
4. A work order flows create → assign mechanic → tasks → parts consumed (decrementing parts inventory with lot/serial where applicable) → sign-off by A&P or IA based on task type → return-to-service, and airframe/engine/prop digital logbook PDF export is produced with timestamped signed entries
5. Admin dashboard and each aircraft profile display a "next grounding event" countdown and a rule-based downtime forecast using scheduled reservations and historical squawk-repair averages
6. The Phase 3 `isAirworthyAt()` stub is fully replaced by real rules derived from inspection state, open squawks, AD compliance, and component lifing; ADs are first-class entities with applicability, method, due-at rule, and compliance history — never free text

**Plans:** 5/5 plans complete

- [ ] 04-01-PLAN.md — CAMP enums, tables, RLS, audit/hard-delete/seal triggers, cross-tenant tests
- [ ] 04-02-PLAN.md — SQL functions, business triggers, is_airworthy_at body replacement + Phase 3 regression guard
- [ ] 04-03-PLAN.md — tRPC routers (maintenance/ads/components/workOrders/parts/logbook/templates/overruns/squawks), mechanicOrAdminProcedure, signer snapshot helper, API tests
- [ ] 04-04-PLAN.md — Admin UI pages (dashboard, aircraft panel, squawks, work orders, parts, ADs, templates) + dispatch MEL badge
- [ ] 04-05-PLAN.md — PDF library spike + logbook PDF export + seed templates + end-of-phase human verify

### Phase 5: Syllabus Model, Grading & Records

**Goal**: A student's training is structured in a deep Course → Stage → Phase → Unit → Lesson → Line Item hierarchy, locked once started, graded with objectives and completion standards, and exportable in formats an FAA inspector recognizes.
**Depends on**: Phase 4
**Requirements**: SYL-01, SYL-02, SYL-03, SYL-04, SYL-05, SYL-06, SYL-07, SYL-08, SYL-09, SYL-10, SYL-11, SYL-12, SYL-13, SYL-14, SYL-25, STU-02, STU-03, SCH-12
**Success Criteria** (what must be TRUE):

1. The data model implements Course → Stage → Phase → Unit → Lesson → Line Item; seeded templates for Private Pilot, Instrument, and Commercial Single-Engine ship with the system, and a school can fork a template or author a custom syllabus
2. Every course component carries structured Objectives and Completion Standards shown to the instructor on the grade sheet; line items are flagged Required, Optional, or Must Pass (progression logic lands in Phase 6)
3. Syllabuses are versioned; an enrolled student is locked to the version they started on; a chief instructor can publish revisions without disrupting in-flight students
4. After a lesson, an instructor grades each line item on the syllabus's chosen scale (absolute Introduce/Practice/Perform/Mastered, or relative 1–5); grades are append-only with electronic signature and timestamp; stage checks assigned to a different instructor record pass/fail with remarks; written/oral test scores can be entered against any course component
5. Endorsements drawn from an AC 61-65 library are captured in the training record with date and instructor signature; currency tracking (BFR, IPC, medical class+expiration, solo scope+expiration, day/night/PIC) is surfaced on the student profile and blocks SCH-12 (student qualification/currency check for the lesson)
6. A complete chronological training record per student (lessons, grades, endorsements, stage checks, sign-offs) is exportable as a 141.101-shaped PDF; an IACRA-friendly hours summary broken out by 61.51(e) category/class is exportable; a student can view their own record read-only and their flight log with totals by PIC/dual/solo/XC/night/IFR

**Plans:** 5 plans
Plans:

- [ ] 05-01-PLAN.md — Schema: course tree + versioning + grading + stage check + endorsement + flight_log_time + personnel_currency rename + RLS tests
- [ ] 05-02-PLAN.md — Seed AC 61-65K endorsement catalog + 3 system courses (PPL/IR/CSEL) with seed.sql re-insert
- [ ] 05-03-PLAN.md — tRPC routers (admin.courses/enrollments/stageChecks/endorsements/studentCurrencies, gradeSheet, flightLog, record, schedule.checkStudentCurrency) + adminOrChiefInstructorProcedure + signer helper
- [ ] 05-04-PLAN.md — Admin UI (courses/versions/lessons/enrollments/stage-checks/endorsements/student currencies/student record) + dispatch close-out lesson picker + grade sheet editor + flight time categorization
- [ ] 05-05-PLAN.md — 141.101 PDF + IACRA PDF+CSV routes + student-facing /record and /flight-log + end-of-phase human-verify

### Phase 6: Syllabus Rules, Progression & Audit

**Goal**: The syllabus actively drives what gets scheduled and what is legal to fly — incomplete work rolls forward, prerequisites and currencies gate scheduling, overrides are auditable, and the school can see every student's position against plan at any moment.
**Depends on**: Phase 5
**Requirements**: SYL-15, SYL-16, SYL-17, SYL-18, SYL-19, SYL-20, SYL-21, SYL-22, SYL-23, SYL-24, SCH-05, SCH-11, SCH-14, IPF-06
**Success Criteria** (what must be TRUE):

1. Any Required or Must-Pass line item not satisfactorily completed in a lesson auto-rolls forward onto the next lesson's grade sheet until satisfied; authorized-repeat counts are enforced and exceeding them triggers management review
2. A lesson cannot be scheduled or graded until its prerequisites, required instructor qualifications/currencies (SCH-11), required student qualifications/currencies (SCH-05), and required resources (aircraft type, IFR-equipped, complex, sim type) are satisfied by the rules engine
3. Admin/chief instructor can issue a management override to perform a lesson out of syllabus order; every override is logged with reason, authorizer, timestamp, and surfaces on the audit trail and as an IPF-06 management alert
4. Each student has a real-time course minimums tracker (FAA hour minimums: dual, solo, night, XC, instrument) updated after every flight close-out, plus an ahead/behind plan indicator and a projected checkride and course completion date derived from remaining work and recent training cadence
5. When scheduling a student, the system proposes the next activity based on syllabus progress, prerequisites, currencies, and rollover state
6. A nightly automated training-record audit verifies every student's record for missing lessons, endorsements, hours, and stage checks and surfaces exceptions on the admin audit dashboard
   **Plans**: TBD

### Phase 7: ADS-B Fleet Integration

**Goal**: The school can see where its aircraft actually are in real time, without duplicating the existing ADS-B Tracker stack.
**Depends on**: Phase 2 (aircraft tail numbers); may run in parallel with Phase 5/6 after Phase 4
**Requirements**: ADS-01, ADS-02, ADS-03, ADS-04, ADS-05, ADS-06, ADS-07
**Success Criteria** (what must be TRUE):

1. The school app calls the existing ADS-B Tracker REST API (default port 3002, configurable) behind an `AdsbProvider` interface; no ADS-B ingestion logic is duplicated inside this app
2. A live fleet map view shows every school aircraft (matched by tail number) with current position, altitude, speed, heading, and last-update age, refreshing at a cadence that feels live (~5s target)
3. The same map can render surrounding traffic in a configurable bbox (default: school home airport area), visually distinguished from school aircraft
4. Clicking a school aircraft deep-links to its aircraft profile (current reservation, fleet status, recent flights); a flight track replay view renders the most recent flight from the Tracker's `/api/swim/tracks` endpoint
5. An admin can define a training-area geofence; the system raises an alert when a school aircraft is observed outside it
   **Plans**: TBD

### Phase 8: Experience, Reporting, Messaging & Beta

**Goal**: The app feels like a single coherent product to each role, every number the school cares about is reportable, and the partner school can run operations on it.
**Depends on**: Phases 1–7
**Requirements**: STU-01, STU-04, INS-01, INS-02, INS-03, SCH-10, NOT-01, NOT-02, IPF-03, IPF-04, IPF-05, REP-01, REP-02, REP-03, REP-04, REP-05, REP-06, MSG-01, MSG-02, MSG-03, MSG-04, MUL-03
**Success Criteria** (what must be TRUE):

1. Student dashboard shows next reservation, syllabus progress, currency, outstanding squawks on next aircraft, and expiring documents; students can upload medical/license/ID. Instructor dashboard shows today's schedule, assigned students, pending grades, and pending stage checks, with a single workflow to grade, endorse, and approve reservation requests
2. Every relevant event (reservation request/approve/change/reminder, grading complete, squawk opened/grounding/RTS, document expiring, currency expiring) produces an in-app notification and a per-user-configurable email; high-priority dispatch events (overdue aircraft, grounded-aircraft attempted use, urgent message) fire an audio/visual cue on the dispatch screen
3. A single audit log is queryable by user, record, or date range and shows who/what/when/prior-value; a training activity audit trail captures scheduler, authorizer, ramp-out, ramp-in, and completion for every scheduled activity
4. Up-to-the-minute student training cost (billable hours × rate + instructor cost + surcharges) and projected total cost through course completion are displayed on the student profile using admin-configured per-hour rates
5. Standard reports (fleet utilization, instructor utilization + pass rate + workload + duty-hour warnings, student progress, no-show rate, squawk turnaround, course completion rate) are exportable as CSV and PDF, and can be filtered by base or rolled up across all bases
6. Internal IM works between users with unread badges; admin can broadcast to a role; admin active-session view shows who is logged in and can IM them directly
7. A beta readiness checklist passes: CFI review of all export templates for terminology compliance, E2E tests covering the safety-critical flows (scheduling conflict, airworthiness gate, sign-off authority, currency/prerequisite block, rollover, override audit), and a partner-school onboarding runbook exists
   **Plans**: TBD

## Progress

| Phase                                      | Plans Complete | Status      | Completed  |
| ------------------------------------------ | -------------- | ----------- | ---------- |
| 1. Foundation & Terminology Contract       | 2/4            | Complete    | 2026-04-07 |
| 2. Personnel, Admin & Fleet Primitives     | 0/0            | Complete    | 2026-04-08 |
| 3. Scheduling & Dispatch Execution         | 0/0            | Complete    | 2026-04-08 |
| 4. CAMP Maintenance                        | 0/0            | Complete    | 2026-04-09 |
| 5. Syllabus Model, Grading & Records       | 0/0            | Not started | -          |
| 6. Syllabus Rules, Progression & Audit     | 0/0            | Not started | -          |
| 7. ADS-B Fleet Integration                 | 0/0            | Not started | -          |
| 8. Experience, Reporting, Messaging & Beta | 0/0            | Not started | -          |

---

_Roadmap created: 2026-04-06_
_Revised: 2026-04-06 — expanded to 8 phases / 136 requirements_
