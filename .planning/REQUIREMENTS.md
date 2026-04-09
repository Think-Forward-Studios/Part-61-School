# Requirements: Part 61 School

**Defined:** 2026-04-06
**Core Value:** Give a Part 61 school a single source of truth for fleet, training, and scheduling so it can operate as professionally as a 141 school. All four pillars must work cohesively in v1; none individually need to be flawless.

## v1 Requirements

### Foundation

- [x] **FND-01**: Multi-tenant Postgres schema with `school_id` on every business table, enforced by Row Level Security
- [x] **FND-02**: Single-tenant deploy for partner school, but architecture supports onboarding additional schools without schema changes
- [x] **FND-03**: Audit trail (who/what/when) on every mutation to safety-relevant data (aircraft, maintenance, training records, schedules, sign-offs)
- [x] **FND-04**: Append-only event log for maintenance and training records (soft delete only, never hard delete)
- [x] **FND-05**: CI-enforced banned-term lint that prevents the words "Part 141", "approved", "certified course" from appearing in user-facing UI/exports
- [x] **FND-06**: Timezone-correct date handling (`timestamptz` everywhere, `date-fns-tz` in app, school-local timezone configurable)
- [ ] **FND-07**: Document storage for medicals, licenses, insurance scans (S3-compatible / Supabase Storage), with expiration tracking

### Authentication & Authorization

- [ ] **AUTH-01**: User can sign up with email + password (admin-invited or self-registered, configurable per school)
- [ ] **AUTH-02**: User receives email verification before account is active
- [ ] **AUTH-03**: User can reset password via email link
- [ ] **AUTH-04**: User session persists across browser refresh
- [ ] **AUTH-05**: User can log out from any page
- [x] **AUTH-06**: System supports four roles: Student, Instructor, Mechanic, Admin (a user may hold multiple roles)
- [x] **AUTH-07**: Mechanic role distinguishes A&P from IA authority (only IA can sign annual inspections, only A&P/IA can sign 100hr/return-to-service)
- [ ] **AUTH-08**: All role-gated UI is also enforced server-side (UI hiding is not security)

### Admin

- [x] **ADM-01**: Admin can create, edit, soft-delete student users
- [x] **ADM-02**: Admin can create, edit, soft-delete instructor users
- [x] **ADM-03**: Admin can create, edit, soft-delete mechanic users (with A&P/IA designation)
- [x] **ADM-04**: Admin can assign and change roles on any user
- [ ] **ADM-05**: Admin can create, edit, soft-delete aircraft (tail number, make/model/year, equipment, home base, photo)
- [ ] **ADM-06**: Admin can configure school settings (name, timezone, default home base, syllabus templates enabled)
- [ ] **ADM-07**: Admin dashboard shows fleet status at a glance (each aircraft: airworthy / grounded / next-due item)

### Fleet & Aircraft

- [x] **FLT-01**: Each aircraft has independent time series for Hobbs, tach, airframe time, and engine time(s)
- [x] **FLT-02**: Time entries are append-only events (`flight_log_entry`) with prior/current values, recorded by an instructor or student at flight close-out
- [x] **FLT-03**: System computes current totals as a derived query over the event log (never stored as a single mutable column)
- [x] **FLT-04**: Aircraft has a current airworthiness status (`isAirworthyAt(date)`) derived from inspection state, open squawks, AD compliance, and component lifing
- [x] **FLT-05**: Aircraft can carry equipment (avionics, GPS, autopilot) used by syllabus to filter "this aircraft can be used for this lesson"
- [ ] **FLT-06**: Aircraft has a profile page showing totals, upcoming maintenance, recent flights, open squawks, current schedule

### Scheduling

- [x] **SCH-01**: Student can request a reservation (aircraft + instructor + start/end + lesson reference + remarks)
- [x] **SCH-02**: Reservation conflicts (same aircraft or same instructor overlapping) are prevented at the database level using a Postgres `EXCLUDE USING gist` constraint on `tstzrange` — application code cannot bypass this
- [x] **SCH-03**: Instructor or admin must approve a student's reservation request before it is confirmed
- [x] **SCH-04**: A reservation cannot be confirmed for an aircraft that is grounded or whose `isAirworthyAt(reservation_start)` is false
- [ ] **SCH-05**: Reservation cannot be confirmed if student is missing a prerequisite (medical expired, no solo endorsement for solo flight, currency lapsed)
- [x] **SCH-06**: Recurring reservations (e.g. "every Tue/Thu 4pm for 6 weeks") are supported
- [x] **SCH-07**: Calendar views: by aircraft, by instructor, by student, by day/week/month
- [x] **SCH-08**: Reservation lifecycle: requested → approved → dispatched (briefing complete) → flown (Hobbs in/out captured) → closed → archived
- [x] **SCH-09**: No-show, weather scrub, and cancellation each have distinct close-out states with required reason
- [ ] **SCH-10**: Student and instructor receive notification (in-app + email) on reservation request, approval, change, and reminder
- [ ] **SCH-11**: System verifies **instructor currencies and qualifications** required by the lesson (per SYL-18) before allowing the reservation to be confirmed
- [ ] **SCH-12**: System verifies **student qualifications and currencies** required by the lesson (per SYL-19 rules + SYL-12) before allowing the reservation
- [x] **SCH-13**: Schedulable resource types include **flight, simulator, oral, academic/ground**, and miscellaneous (safety meeting, briefing) — not only flight reservations
- [ ] **SCH-14**: **"Next activity" suggestion** — when scheduling a student, system proposes the next lesson the student is due to take based on syllabus progress, prerequisites, and currencies
- [x] **SCH-15**: Personnel can schedule **unavailability** (vacation, doctor, dental, sick) that blocks reservations against them
- [x] **SCH-16**: **Block scheduling** — admin can pre-define recurring blocks of (instructor + aircraft + slot) and students request into those blocks
- [x] **SCH-17**: Schedule view distinguishes flight, sim, oral, academic, and unavailability with visual cues
- [x] **SCH-18**: Resource availability (aircraft maintenance status, instructor unavailability, room booking) is integrated into a single conflict check

### Maintenance (CAMP-style)

- [x] **MNT-01**: Maintenance items are typed (100hr inspection, annual, AD, oil change, transponder cert, ELT, pitot-static, etc.) with interval rules referencing the correct clock (Hobbs / tach / airframe / calendar)
- [x] **MNT-02**: Each maintenance item has a "due at" derivation (next due hours OR next due date, whichever is sooner)
- [x] **MNT-03**: System auto-grounds an aircraft when an item passes its compliance limit (does not allow over-fly except via FAR 91.409 10-hour overrun, which requires explicit recorded justification by IA)
- [x] **MNT-04**: Squawk lifecycle: opened by anyone with role → triaged by mechanic → grounding decision → repaired → return-to-service signed by A&P or IA
- [ ] **MNT-05**: Open squawks visible on aircraft profile and on scheduling UI; certain squawk severities ground the aircraft automatically
- [x] **MNT-06**: Component lifing for life-limited parts (e.g. mag overhaul, prop overhaul) tracked with current time and life limit
- [x] **MNT-07**: AD (Airworthiness Directive) tracking: each AD has applicability, compliance method, due-at rule, and compliance history
- [x] **MNT-08**: Parts inventory: track on-hand quantity, part number, lot/serial where applicable, used-on-aircraft history (no labor billing)
- [x] **MNT-09**: Work order: create → assign mechanic → tasks → parts consumed → sign-off (A&P or IA based on task type) → return-to-service
- [x] **MNT-10**: Digital logbook PDF export (airframe, engine, prop) acceptable to FAA inspection of a Part 61 school's voluntary records — append-only, signed entries with timestamp and user binding
- [x] **MNT-11**: Downtime prediction: rule-based forecast of next 100hr/annual due date using upcoming reservations + historical squawk-repair-time average per aircraft, surfaced on the admin dashboard and aircraft profile

### Syllabus & Training Records

- [ ] **SYL-01**: Syllabus data model: Course → Stage → Phase → Unit → Lesson → Line Item (training objective), mirroring the 141 TCO structure (used internally; not labeled "141" in UI)
- [ ] **SYL-02**: System ships with seed templates for Private Pilot, Instrument Rating, and Commercial Single-Engine, derived from publicly available 141 TCOs, that the school can fork and customize
- [ ] **SYL-03**: School can create a custom syllabus from scratch or by forking a template
- [ ] **SYL-04**: Syllabuses are versioned; an enrolled student is locked to the version they started on, and a chief instructor can publish revisions without disrupting in-flight students
- [ ] **SYL-05**: Student can be enrolled in one or more syllabuses; current progress is visible (lessons complete, current stage, next lesson)
- [ ] **SYL-06**: Each line item has a grading scale; school can choose absolute grading (Introduce/Practice/Perform/Mastered) or relative grading (1-5 against standard) per syllabus
- [ ] **SYL-07**: Instructor grades line items after a lesson; grades are append-only and require an electronic signature with timestamp
- [ ] **SYL-08**: Stage check workflow: stage check assigned, conducted by a different instructor, recorded with pass/fail and remarks
- [ ] **SYL-09**: Endorsement library (AC 61-65 templates) — instructor can issue an endorsement to a student; endorsement is captured in training record with date and instructor signature
- [ ] **SYL-10**: Training record per student: chronological list of lessons, grades, endorsements, stage checks, instructor sign-offs — exportable as PDF in the format required by 14 CFR 141.101 (used internally as a record-keeping standard)
- [ ] **SYL-11**: IACRA-friendly export: student progress summary in a format that helps an instructor fill out IACRA when the student is ready for a checkride
- [ ] **SYL-12**: Currency tracking: BFR, IPC, medical class+expiration, solo endorsement scope+expiration, day/night/PIC currency — surfaced on student profile and used by SCH-05
- [ ] **SYL-13**: Every course component (Stage, Phase, Unit, Lesson, Line Item) can carry **Objectives** and **Completion Standards** as structured text fields shown to instructor on the grade sheet
- [ ] **SYL-14**: Line items can be flagged **Required**, **Optional**, or **Must Pass**; course completion logic respects these flags
- [ ] **SYL-15**: **Incomplete line items auto-roll forward** — any Required or Must Pass line item not satisfactorily completed in a lesson is automatically inserted into the next lesson's grade sheet until satisfied
- [ ] **SYL-16**: **Prerequisite enforcement** — a lesson cannot be scheduled or graded until all prerequisite lessons/line items are complete
- [ ] **SYL-17**: **Management override** — admin/chief instructor can authorize a student to perform a lesson out of syllabus order; override is logged with reason, authorizer, and timestamp, and surfaces in the audit trail
- [ ] **SYL-18**: Lesson definition can specify **unit duration** (planned hours), **required resources** (aircraft type, sim type), **resource configuration** (e.g. IFR-equipped, complex), and **instructor qualifications/currencies** required to teach it
- [ ] **SYL-19**: Syllabus rules engine — multiple rules per course component (e.g. "Must hold solo endorsement before this lesson", "Aircraft must be IFR-equipped", "Instructor must hold CFII"); rules evaluated at scheduling and grading time
- [ ] **SYL-20**: Authorized repeats — each line item / lesson can declare maximum repeat count for unsatisfactory completion before management review is required
- [ ] **SYL-21**: Per-student **course minimums tracker** (FAA hour minimums: dual, solo, night, cross-country, instrument, etc.) updated in real time after each flight close-out
- [ ] **SYL-22**: **Ahead/behind training plan indicator** — projects expected progress at current pace and shows whether the student is on, ahead of, or behind plan
- [ ] **SYL-23**: **Projected checkride and course completion date** — derived from remaining required hours/lessons and the student's recent training cadence
- [ ] **SYL-24**: **Automated training record audit** — nightly job verifies every student's record for missing lessons, missing endorsements, missing hours, missing stage checks; surfaces exceptions on the admin audit dashboard
- [ ] **SYL-25**: **Test grade entry** — instructor can record written/oral test scores against any course component (knowledge test, end-of-stage test, end-of-course oral)

### Student Experience

- [ ] **STU-01**: Student dashboard shows next reservation, current syllabus progress, currency status, outstanding squawks affecting their next aircraft, and any expiring documents
- [ ] **STU-02**: Student can view their own training record (read-only) and download it as PDF
- [ ] **STU-03**: Student can view their flight log and total hours by category (PIC, dual, solo, XC, night, IFR, etc.)
- [ ] **STU-04**: Student can upload medical, license, and ID documents to their profile

### Instructor Experience

- [ ] **INS-01**: Instructor dashboard shows today's schedule, students assigned, pending grade entries, pending stage checks
- [ ] **INS-02**: Instructor can view any of their students' training records (read+grade, no destructive actions)
- [ ] **INS-03**: Instructor can grade a lesson, sign endorsements, and approve reservation requests from a single workflow
- [x] **INS-04**: Instructor can mark a flight closed and capture Hobbs/tach in/out, fuel, oil, route, and any squawks observed

### Personnel Management

- [x] **PER-01**: Personnel record holds full biographic and demographic data (name, DOB, address, phone, email, FAA airman cert number, citizenship status for TSA AFSP)
- [x] **PER-02**: **Online student self-registration** with admin approval queue (configurable per school)
- [x] **PER-03**: **Emergency contact** information on every personnel record, immediately accessible from their profile and dispatch screen
- [x] **PER-04**: **Student information release authorizations** (who is allowed to receive training info — parents, employer, sponsor)
- [x] **PER-05**: Student can be placed on **hold or grounded** with reason; held/grounded students cannot be scheduled until cleared by admin
- [x] **PER-06**: Instructor can be **grounded** by admin with reason; grounded instructors cannot be scheduled to teach
- [x] **PER-07**: **Student no-show records** — every no-show is logged on the student's profile with date, scheduled activity, and instructor; aggregate no-show count visible
- [x] **PER-08**: **Rental customer** record type (non-student pilot renting an aircraft) with currency tracking, checkout requirements, and rental history
- [x] **PER-09**: **Student training history** view — every course the student has been enrolled in (current and past) with completion status
- [x] **PER-10**: **Instructor flight experience history** — career hours by category, recent activity, instructor's own pilot log

### Instructor Performance & Workload

- [x] **IPF-01**: Track instructor **currencies** with expiration dates (CFI, CFII, MEI, medical, BFR, IPC) and auto-warn before expiration
- [x] **IPF-02**: Track instructor **qualifications** (aircraft type ratings, sim authorizations, course authorizations to teach)
- [ ] **IPF-03**: **Instructor pass rate** — for each instructor, percentage of their students who pass checkrides on first attempt, displayed on the instructor profile
- [ ] **IPF-04**: **Instructor flight/duty hour violation warnings** — system warns when scheduling would push an instructor past configurable daily/weekly hour limits (FAR 61.195)
- [ ] **IPF-05**: **Instructor workload monitor** — admin dashboard panel showing each instructor's scheduled hours this week, students assigned, pending grades
- [ ] **IPF-06**: **Management alerts** for any training activity flown out of syllabus order, beyond authorized repeats, or otherwise non-conforming (consumes SYL-17/SYL-20 events)

### Flight Tracking & Dispatch

- [x] **FTR-01**: **Real-time schedule execution** — dispatch screen shows what's currently flying, what's about to fly, what's overdue, color-coded
- [x] **FTR-02**: **Electronic student check-in** — student arrives, checks in via the app; instructor electronically authorizes (releases the flight)
- [x] **FTR-03**: **Aircraft check-out / check-in** — captures Hobbs/tach out at dispatch, Hobbs/tach in at return, updates fleet log
- [x] **FTR-04**: **Overdue aircraft alert** — if a flight is past its expected end time + grace window, dispatch screen raises an alarm and notifies admin/duty instructor
- [x] **FTR-05**: **Cross-country flight following** — for XC flights, dispatcher can record planned route, ETE, intermediate stops; integrates with ADS-B map view (Phase 7) when available
- [x] **FTR-06**: **Electronic passenger manifest** — for any flight with passengers, captures passenger names, weights, emergency contact; printable
- [x] **FTR-07**: **Flight Information File (FIF)** — admin posts notices/NOTAMs/policy items; pilots must acknowledge sign-off before dispatch
- [x] **FTR-08**: Flight close-out workflow consolidates: Hobbs/tach in, fuel/oil, route flown, line-item grading, squawks observed, next-lesson preview — all in one screen

### Audit & Reporting

- [ ] **REP-01**: Every change to safety-relevant or training-relevant data is logged with **who, what, when, and prior value** — single audit log queryable by user, by record, or by date range
- [ ] **REP-02**: **Training activity audit trail** — for every scheduled activity, captures who scheduled it, who authorized it, ramp-out time, ramp-in time, and completion record
- [ ] **REP-03**: **Up-to-the-minute training cost** for a student — sums billable hours × rate + instructor cost + surcharges, even before invoicing exists (uses simple per-hour rates configured by admin)
- [ ] **REP-04**: **Projected total cost through course completion** — uses remaining required hours × current rates
- [ ] **REP-05**: Standard reports: fleet utilization, instructor utilization, student progress, no-show rate, squawk turnaround, course completion rate
- [ ] **REP-06**: All reports exportable as CSV and PDF

### Messaging & Operations

- [ ] **MSG-01**: **Internal instant messaging** between users (student↔instructor, admin↔anyone) within the app, with unread badge
- [ ] **MSG-02**: Admin can broadcast a notice to all users in a role (e.g. "All instructors: meeting Thursday")
- [ ] **MSG-03**: **Active session view for admin** — admin can see which users are currently logged in and IM them directly
- [ ] **MSG-04**: Audio/visual cue on dispatch screen for high-priority events (overdue aircraft, grounded aircraft attempted use, urgent message)

### Multi-Location Support

- [x] **MUL-01**: A school can have multiple **training locations** (bases); aircraft, instructors, and rooms are scoped to a base
- [x] **MUL-02**: User can switch active base context if they hold roles at more than one
- [ ] **MUL-03**: Reports and dashboards can be filtered by base or rolled up across all bases

### ADS-B Fleet Visibility (integration with existing ADS-B Tracker)

- [ ] **ADS-01**: Part 61 School app integrates with the existing ADS-B Tracker service via its REST API (port 3002 by default, configurable) — does not duplicate the ADS-B stack
- [ ] **ADS-02**: Live fleet map view shows all of the school's aircraft (matched by tail number) with current position, altitude, speed, heading, and last-update age, sourced from FAA SWIM SCDS via the ADS-B Tracker
- [ ] **ADS-03**: Map can also show surrounding traffic in a configurable bbox (default: school home airport area), using the existing ADS-B Tracker bbox endpoints
- [ ] **ADS-04**: Clicking a school aircraft on the map deep-links to its aircraft profile (current reservation, fleet status, recent flights)
- [ ] **ADS-05**: Geofence alerts: admin can define a training area; system raises an alert when a school aircraft is observed outside it
- [ ] **ADS-06**: Flight track replay for the most recent flight of each school aircraft (sourced from the ADS-B Tracker `/api/swim/tracks` endpoint)
- [ ] **ADS-07**: Provider abstraction: ADS-B integration is wrapped in an `AdsbProvider` interface so the SWIM source can be swapped without touching school app code

### Notifications

- [ ] **NOT-01**: In-app notifications for: reservation events (request/approve/change/reminder), grading complete, squawk opened/grounding/return-to-service, document expiring, currency expiring
- [ ] **NOT-02**: Email notifications for the same events, configurable per user

## v2 Requirements

Deferred to a follow-on release.

### Mobile

- **MOB-01**: React Native / Expo mobile app (iOS + Android) sharing tRPC types with web
- **MOB-02**: Offline-first instructor cockpit grading (local SQLite + sync on reconnect)
- **MOB-03**: Student check-in / Hobbs entry from phone
- **MOB-04**: Mobile fleet map

### Cashier, Billing & Payroll

- **BIL-01**: Student account balance, lesson invoicing, dispatch holds when balance is overdue
- **BIL-02**: Stripe integration for payment collection
- **BIL-03**: Aircraft block-time accounting
- **BIL-04**: Cashier check-out flow for "pay as you go" customers
- **BIL-05**: Contract rates per student / per course / per aircraft, with surcharges
- **BIL-06**: Debit accounts with low-balance warnings and hard-stop dispatch holds
- **BIL-07**: Electronic + paper invoice (aircraft time, instructor time, misc charges)
- **BIL-08**: Merchandise / pilot supply sales tracking
- **BIL-09**: Comprehensive financial reports — debit account balances, transactions, trial balance
- **BIL-10**: **Auto payroll entries for hourly instructors** — at flight close-out, generate a payroll line for the instructor's billable time
- **BIL-11**: AICC / SCORM compliance for integrating third-party CBT content

### Migration & Onboarding

- **MIG-01**: CSV import for fleet, students, and instructors
- **MIG-02**: Historical maintenance log importer
- **MIG-03**: Historical training record importer

### Advanced

- **ADV-01**: Weather brief integration on reservation page
- **ADV-02**: AI-assisted downtime prediction trained on school's own data
- **ADV-03**: Multi-school SaaS billing and onboarding self-service
- **ADV-04**: DPE workflow (checkride scheduling, oral/practical record exchange)
- **ADV-05**: Mechanic labor billing and time tracking

## Out of Scope

Explicitly excluded — documented to prevent scope creep.

| Feature                                                                | Reason                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Actual FAA Part 141 certification workflow                             | We mirror the structure as a voluntary internal standard; we do not certify schools              |
| Use of "Part 141" or "approved" language in user-facing UI/exports     | Regulatory risk to the partner school — we are a Part 61 tool with rigor, not a certified course |
| Local ADS-B receiver ingestion (dump1090/PiAware)                      | Existing ADS-B Tracker already covers this via FAA SWIM SCDS — no need to duplicate              |
| FlightAware / OpenSky / ADSBexchange paid feeds                        | FAA SWIM SCDS via existing ADS-B Tracker is government data, free, and broader                   |
| Weather briefing, flight planning, weight & balance                    | Pilots have ForeFlight; we don't compete with cockpit apps                                       |
| Full mechanic labor billing                                            | Out per PROJECT.md — only sign-off is tracked, not labor hours                                   |
| Mobile app in v1                                                       | Deferred to v1.1; web-first to ship faster                                                       |
| Student tuition collection / Stripe in v1                              | Deferred to v2                                                                                   |
| Replacement for an FAA-certified electronic logbook on a pilot's phone | Pilots use LogTen Pro / ForeFlight Logbook for their personal log                                |
| AI-authored grades                                                     | Liability and pedagogical concerns — humans grade                                                |

## Traceability

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| FND-01      | Phase 1 | Pending  |
| FND-02      | Phase 1 | Pending  |
| FND-03      | Phase 1 | Pending  |
| FND-04      | Phase 1 | Pending  |
| FND-05      | Phase 1 | Complete |
| FND-06      | Phase 1 | Pending  |
| FND-07      | Phase 1 | Pending  |
| AUTH-01     | Phase 1 | Pending  |
| AUTH-02     | Phase 1 | Pending  |
| AUTH-03     | Phase 1 | Pending  |
| AUTH-04     | Phase 1 | Pending  |
| AUTH-05     | Phase 1 | Pending  |
| AUTH-06     | Phase 1 | Pending  |
| AUTH-07     | Phase 1 | Pending  |
| AUTH-08     | Phase 1 | Pending  |
| ADM-01      | Phase 2 | Complete |
| ADM-02      | Phase 2 | Complete |
| ADM-03      | Phase 2 | Complete |
| ADM-04      | Phase 2 | Complete |
| ADM-05      | Phase 2 | Pending  |
| ADM-06      | Phase 2 | Pending  |
| ADM-07      | Phase 2 | Pending  |
| FLT-01      | Phase 2 | Complete |
| FLT-02      | Phase 2 | Complete |
| FLT-03      | Phase 2 | Complete |
| FLT-04      | Phase 3 | Complete |
| FLT-05      | Phase 2 | Complete |
| FLT-06      | Phase 2 | Pending  |
| PER-01      | Phase 2 | Complete |
| PER-02      | Phase 2 | Complete |
| PER-03      | Phase 2 | Complete |
| PER-04      | Phase 2 | Complete |
| PER-05      | Phase 2 | Complete |
| PER-06      | Phase 2 | Complete |
| PER-07      | Phase 2 | Complete |
| PER-08      | Phase 2 | Complete |
| PER-09      | Phase 2 | Complete |
| PER-10      | Phase 2 | Complete |
| IPF-01      | Phase 2 | Complete |
| IPF-02      | Phase 2 | Complete |
| MUL-01      | Phase 2 | Complete |
| MUL-02      | Phase 2 | Complete |
| SCH-01      | Phase 3 | Complete |
| SCH-02      | Phase 3 | Complete |
| SCH-03      | Phase 3 | Complete |
| SCH-04      | Phase 3 | Complete |
| SCH-05      | Phase 6 | Pending  |
| SCH-06      | Phase 3 | Complete |
| SCH-07      | Phase 3 | Complete |
| SCH-08      | Phase 3 | Complete |
| SCH-09      | Phase 3 | Complete |
| SCH-10      | Phase 8 | Pending  |
| SCH-11      | Phase 6 | Pending  |
| SCH-12      | Phase 5 | Pending  |
| SCH-13      | Phase 3 | Complete |
| SCH-14      | Phase 6 | Pending  |
| SCH-15      | Phase 3 | Complete |
| SCH-16      | Phase 3 | Complete |
| SCH-17      | Phase 3 | Complete |
| SCH-18      | Phase 3 | Complete |
| INS-04      | Phase 3 | Complete |
| FTR-01      | Phase 3 | Complete |
| FTR-02      | Phase 3 | Complete |
| FTR-03      | Phase 3 | Complete |
| FTR-04      | Phase 3 | Complete |
| FTR-05      | Phase 3 | Complete |
| FTR-06      | Phase 3 | Complete |
| FTR-07      | Phase 3 | Complete |
| FTR-08      | Phase 3 | Complete |
| MNT-01      | Phase 4 | Complete |
| MNT-02      | Phase 4 | Complete |
| MNT-03      | Phase 4 | Complete |
| MNT-04      | Phase 4 | Complete |
| MNT-05      | Phase 4 | Pending  |
| MNT-06      | Phase 4 | Complete |
| MNT-07      | Phase 4 | Complete |
| MNT-08      | Phase 4 | Complete |
| MNT-09      | Phase 4 | Complete |
| MNT-10      | Phase 4 | Complete |
| MNT-11      | Phase 4 | Complete |
| SYL-01      | Phase 5 | Pending  |
| SYL-02      | Phase 5 | Pending  |
| SYL-03      | Phase 5 | Pending  |
| SYL-04      | Phase 5 | Pending  |
| SYL-05      | Phase 5 | Pending  |
| SYL-06      | Phase 5 | Pending  |
| SYL-07      | Phase 5 | Pending  |
| SYL-08      | Phase 5 | Pending  |
| SYL-09      | Phase 5 | Pending  |
| SYL-10      | Phase 5 | Pending  |
| SYL-11      | Phase 5 | Pending  |
| SYL-12      | Phase 5 | Pending  |
| SYL-13      | Phase 5 | Pending  |
| SYL-14      | Phase 5 | Pending  |
| SYL-15      | Phase 6 | Pending  |
| SYL-16      | Phase 6 | Pending  |
| SYL-17      | Phase 6 | Pending  |
| SYL-18      | Phase 6 | Pending  |
| SYL-19      | Phase 6 | Pending  |
| SYL-20      | Phase 6 | Pending  |
| SYL-21      | Phase 6 | Pending  |
| SYL-22      | Phase 6 | Pending  |
| SYL-23      | Phase 6 | Pending  |
| SYL-24      | Phase 6 | Pending  |
| SYL-25      | Phase 5 | Pending  |
| STU-01      | Phase 8 | Pending  |
| STU-02      | Phase 5 | Pending  |
| STU-03      | Phase 5 | Pending  |
| STU-04      | Phase 8 | Pending  |
| INS-01      | Phase 8 | Pending  |
| INS-02      | Phase 8 | Pending  |
| INS-03      | Phase 8 | Pending  |
| IPF-03      | Phase 8 | Pending  |
| IPF-04      | Phase 8 | Pending  |
| IPF-05      | Phase 8 | Pending  |
| IPF-06      | Phase 6 | Pending  |
| REP-01      | Phase 8 | Pending  |
| REP-02      | Phase 8 | Pending  |
| REP-03      | Phase 8 | Pending  |
| REP-04      | Phase 8 | Pending  |
| REP-05      | Phase 8 | Pending  |
| REP-06      | Phase 8 | Pending  |
| MSG-01      | Phase 8 | Pending  |
| MSG-02      | Phase 8 | Pending  |
| MSG-03      | Phase 8 | Pending  |
| MSG-04      | Phase 8 | Pending  |
| MUL-03      | Phase 8 | Pending  |
| ADS-01      | Phase 7 | Pending  |
| ADS-02      | Phase 7 | Pending  |
| ADS-03      | Phase 7 | Pending  |
| ADS-04      | Phase 7 | Pending  |
| ADS-05      | Phase 7 | Pending  |
| ADS-06      | Phase 7 | Pending  |
| ADS-07      | Phase 7 | Pending  |
| NOT-01      | Phase 8 | Pending  |
| NOT-02      | Phase 8 | Pending  |

**Coverage:**

- v1 requirements: 136 total
- Mapped to phases: 136/136
- Unmapped: 0

---

_Requirements defined: 2026-04-06_
_Last updated: 2026-04-06 after roadmap revision (75→136 requirements, 7→8 phases)_
