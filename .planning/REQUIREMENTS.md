# Requirements: Part 61 School

**Defined:** 2026-04-06
**Core Value:** Give a Part 61 school a single source of truth for fleet, training, and scheduling so it can operate as professionally as a 141 school. All four pillars must work cohesively in v1; none individually need to be flawless.

## v1 Requirements

### Foundation

- [ ] **FND-01**: Multi-tenant Postgres schema with `school_id` on every business table, enforced by Row Level Security
- [ ] **FND-02**: Single-tenant deploy for partner school, but architecture supports onboarding additional schools without schema changes
- [ ] **FND-03**: Audit trail (who/what/when) on every mutation to safety-relevant data (aircraft, maintenance, training records, schedules, sign-offs)
- [ ] **FND-04**: Append-only event log for maintenance and training records (soft delete only, never hard delete)
- [ ] **FND-05**: CI-enforced banned-term lint that prevents the words "Part 141", "approved", "certified course" from appearing in user-facing UI/exports
- [ ] **FND-06**: Timezone-correct date handling (`timestamptz` everywhere, `date-fns-tz` in app, school-local timezone configurable)
- [ ] **FND-07**: Document storage for medicals, licenses, insurance scans (S3-compatible / Supabase Storage), with expiration tracking

### Authentication & Authorization

- [ ] **AUTH-01**: User can sign up with email + password (admin-invited or self-registered, configurable per school)
- [ ] **AUTH-02**: User receives email verification before account is active
- [ ] **AUTH-03**: User can reset password via email link
- [ ] **AUTH-04**: User session persists across browser refresh
- [ ] **AUTH-05**: User can log out from any page
- [ ] **AUTH-06**: System supports four roles: Student, Instructor, Mechanic, Admin (a user may hold multiple roles)
- [ ] **AUTH-07**: Mechanic role distinguishes A&P from IA authority (only IA can sign annual inspections, only A&P/IA can sign 100hr/return-to-service)
- [ ] **AUTH-08**: All role-gated UI is also enforced server-side (UI hiding is not security)

### Admin

- [ ] **ADM-01**: Admin can create, edit, soft-delete student users
- [ ] **ADM-02**: Admin can create, edit, soft-delete instructor users
- [ ] **ADM-03**: Admin can create, edit, soft-delete mechanic users (with A&P/IA designation)
- [ ] **ADM-04**: Admin can assign and change roles on any user
- [ ] **ADM-05**: Admin can create, edit, soft-delete aircraft (tail number, make/model/year, equipment, home base, photo)
- [ ] **ADM-06**: Admin can configure school settings (name, timezone, default home base, syllabus templates enabled)
- [ ] **ADM-07**: Admin dashboard shows fleet status at a glance (each aircraft: airworthy / grounded / next-due item)

### Fleet & Aircraft

- [ ] **FLT-01**: Each aircraft has independent time series for Hobbs, tach, airframe time, and engine time(s)
- [ ] **FLT-02**: Time entries are append-only events (`flight_log_entry`) with prior/current values, recorded by an instructor or student at flight close-out
- [ ] **FLT-03**: System computes current totals as a derived query over the event log (never stored as a single mutable column)
- [ ] **FLT-04**: Aircraft has a current airworthiness status (`isAirworthyAt(date)`) derived from inspection state, open squawks, AD compliance, and component lifing
- [ ] **FLT-05**: Aircraft can carry equipment (avionics, GPS, autopilot) used by syllabus to filter "this aircraft can be used for this lesson"
- [ ] **FLT-06**: Aircraft has a profile page showing totals, upcoming maintenance, recent flights, open squawks, current schedule

### Scheduling

- [ ] **SCH-01**: Student can request a reservation (aircraft + instructor + start/end + lesson reference + remarks)
- [ ] **SCH-02**: Reservation conflicts (same aircraft or same instructor overlapping) are prevented at the database level using a Postgres `EXCLUDE USING gist` constraint on `tstzrange` — application code cannot bypass this
- [ ] **SCH-03**: Instructor or admin must approve a student's reservation request before it is confirmed
- [ ] **SCH-04**: A reservation cannot be confirmed for an aircraft that is grounded or whose `isAirworthyAt(reservation_start)` is false
- [ ] **SCH-05**: Reservation cannot be confirmed if student is missing a prerequisite (medical expired, no solo endorsement for solo flight, currency lapsed)
- [ ] **SCH-06**: Recurring reservations (e.g. "every Tue/Thu 4pm for 6 weeks") are supported
- [ ] **SCH-07**: Calendar views: by aircraft, by instructor, by student, by day/week/month
- [ ] **SCH-08**: Reservation lifecycle: requested → approved → dispatched (briefing complete) → flown (Hobbs in/out captured) → closed → archived
- [ ] **SCH-09**: No-show, weather scrub, and cancellation each have distinct close-out states with required reason
- [ ] **SCH-10**: Student and instructor receive notification (in-app + email) on reservation request, approval, change, and reminder

### Maintenance (CAMP-style)

- [ ] **MNT-01**: Maintenance items are typed (100hr inspection, annual, AD, oil change, transponder cert, ELT, pitot-static, etc.) with interval rules referencing the correct clock (Hobbs / tach / airframe / calendar)
- [ ] **MNT-02**: Each maintenance item has a "due at" derivation (next due hours OR next due date, whichever is sooner)
- [ ] **MNT-03**: System auto-grounds an aircraft when an item passes its compliance limit (does not allow over-fly except via FAR 91.409 10-hour overrun, which requires explicit recorded justification by IA)
- [ ] **MNT-04**: Squawk lifecycle: opened by anyone with role → triaged by mechanic → grounding decision → repaired → return-to-service signed by A&P or IA
- [ ] **MNT-05**: Open squawks visible on aircraft profile and on scheduling UI; certain squawk severities ground the aircraft automatically
- [ ] **MNT-06**: Component lifing for life-limited parts (e.g. mag overhaul, prop overhaul) tracked with current time and life limit
- [ ] **MNT-07**: AD (Airworthiness Directive) tracking: each AD has applicability, compliance method, due-at rule, and compliance history
- [ ] **MNT-08**: Parts inventory: track on-hand quantity, part number, lot/serial where applicable, used-on-aircraft history (no labor billing)
- [ ] **MNT-09**: Work order: create → assign mechanic → tasks → parts consumed → sign-off (A&P or IA based on task type) → return-to-service
- [ ] **MNT-10**: Digital logbook PDF export (airframe, engine, prop) acceptable to FAA inspection of a Part 61 school's voluntary records — append-only, signed entries with timestamp and user binding
- [ ] **MNT-11**: Downtime prediction: rule-based forecast of next 100hr/annual due date using upcoming reservations + historical squawk-repair-time average per aircraft, surfaced on the admin dashboard and aircraft profile

### Syllabus & Training Records

- [ ] **SYL-01**: Syllabus data model: Course → Stage → Lesson → Task, mirroring Part 141 TCO structure (used internally; not labeled "141" in UI)
- [ ] **SYL-02**: System ships with seed templates for Private Pilot, Instrument Rating, and Commercial Single-Engine, derived from publicly available 141 TCOs, that the school can fork and customize
- [ ] **SYL-03**: School can create a custom syllabus from scratch or by forking a template
- [ ] **SYL-04**: Syllabuses are versioned; an enrolled student is locked to the version they started on, and a chief instructor can publish revisions without disrupting in-flight students
- [ ] **SYL-05**: Student can be enrolled in one or more syllabuses; current progress is visible (lessons complete, current stage, next lesson)
- [ ] **SYL-06**: Each lesson has tasks with grading scale (e.g. Introduce / Practice / Perform / Mastered or 1-5)
- [ ] **SYL-07**: Instructor grades a lesson after a flight; grades are append-only and require an electronic signature with timestamp
- [ ] **SYL-08**: Stage check workflow: stage check assigned, conducted by a different instructor, recorded with pass/fail and remarks
- [ ] **SYL-09**: Endorsement library (AC 61-65 templates) — instructor can issue an endorsement to a student; endorsement is captured in training record with date and instructor signature
- [ ] **SYL-10**: Training record per student: chronological list of lessons, grades, endorsements, stage checks, instructor sign-offs — exportable as PDF in the format required by 14 CFR 141.101 (used internally as a record-keeping standard)
- [ ] **SYL-11**: IACRA-friendly export: student progress summary in a format that helps an instructor fill out IACRA when the student is ready for a checkride
- [ ] **SYL-12**: Currency tracking: BFR, IPC, medical class+expiration, solo endorsement scope+expiration, day/night/PIC currency — surfaced on student profile and used by SCH-05

### Student Experience

- [ ] **STU-01**: Student dashboard shows next reservation, current syllabus progress, currency status, outstanding squawks affecting their next aircraft, and any expiring documents
- [ ] **STU-02**: Student can view their own training record (read-only) and download it as PDF
- [ ] **STU-03**: Student can view their flight log and total hours by category (PIC, dual, solo, XC, night, IFR, etc.)
- [ ] **STU-04**: Student can upload medical, license, and ID documents to their profile

### Instructor Experience

- [ ] **INS-01**: Instructor dashboard shows today's schedule, students assigned, pending grade entries, pending stage checks
- [ ] **INS-02**: Instructor can view any of their students' training records (read+grade, no destructive actions)
- [ ] **INS-03**: Instructor can grade a lesson, sign endorsements, and approve reservation requests from a single workflow
- [ ] **INS-04**: Instructor can mark a flight closed and capture Hobbs/tach in/out, fuel, oil, route, and any squawks observed

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

### Billing & Payments

- **BIL-01**: Student account balance, lesson invoicing, dispatch holds when balance is overdue
- **BIL-02**: Stripe integration for payment collection
- **BIL-03**: Aircraft block-time accounting

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

| Feature | Reason |
|---------|--------|
| Actual FAA Part 141 certification workflow | We mirror the structure as a voluntary internal standard; we do not certify schools |
| Use of "Part 141" or "approved" language in user-facing UI/exports | Regulatory risk to the partner school — we are a Part 61 tool with rigor, not a certified course |
| Local ADS-B receiver ingestion (dump1090/PiAware) | Existing ADS-B Tracker already covers this via FAA SWIM SCDS — no need to duplicate |
| FlightAware / OpenSky / ADSBexchange paid feeds | FAA SWIM SCDS via existing ADS-B Tracker is government data, free, and broader |
| Weather briefing, flight planning, weight & balance | Pilots have ForeFlight; we don't compete with cockpit apps |
| Full mechanic labor billing | Out per PROJECT.md — only sign-off is tracked, not labor hours |
| Mobile app in v1 | Deferred to v1.1; web-first to ship faster |
| Student tuition collection / Stripe in v1 | Deferred to v2 |
| Replacement for an FAA-certified electronic logbook on a pilot's phone | Pilots use LogTen Pro / ForeFlight Logbook for their personal log |
| AI-authored grades | Liability and pedagogical concerns — humans grade |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| FND-03 | Phase 1 | Pending |
| FND-04 | Phase 1 | Pending |
| FND-05 | Phase 1 | Pending |
| FND-06 | Phase 1 | Pending |
| FND-07 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| AUTH-07 | Phase 1 | Pending |
| AUTH-08 | Phase 1 | Pending |
| ADM-01 | Phase 2 | Pending |
| ADM-02 | Phase 2 | Pending |
| ADM-03 | Phase 2 | Pending |
| ADM-04 | Phase 2 | Pending |
| ADM-05 | Phase 2 | Pending |
| ADM-06 | Phase 2 | Pending |
| ADM-07 | Phase 2 | Pending |
| FLT-01 | Phase 2 | Pending |
| FLT-02 | Phase 2 | Pending |
| FLT-03 | Phase 2 | Pending |
| FLT-04 | Phase 3 | Pending |
| FLT-05 | Phase 2 | Pending |
| FLT-06 | Phase 2 | Pending |
| SCH-01 | Phase 3 | Pending |
| SCH-02 | Phase 3 | Pending |
| SCH-03 | Phase 3 | Pending |
| SCH-04 | Phase 3 | Pending |
| SCH-05 | Phase 5 | Pending |
| SCH-06 | Phase 3 | Pending |
| SCH-07 | Phase 3 | Pending |
| SCH-08 | Phase 3 | Pending |
| SCH-09 | Phase 3 | Pending |
| SCH-10 | Phase 7 | Pending |
| MNT-01 | Phase 4 | Pending |
| MNT-02 | Phase 4 | Pending |
| MNT-03 | Phase 4 | Pending |
| MNT-04 | Phase 4 | Pending |
| MNT-05 | Phase 4 | Pending |
| MNT-06 | Phase 4 | Pending |
| MNT-07 | Phase 4 | Pending |
| MNT-08 | Phase 4 | Pending |
| MNT-09 | Phase 4 | Pending |
| MNT-10 | Phase 4 | Pending |
| MNT-11 | Phase 4 | Pending |
| SYL-01 | Phase 5 | Pending |
| SYL-02 | Phase 5 | Pending |
| SYL-03 | Phase 5 | Pending |
| SYL-04 | Phase 5 | Pending |
| SYL-05 | Phase 5 | Pending |
| SYL-06 | Phase 5 | Pending |
| SYL-07 | Phase 5 | Pending |
| SYL-08 | Phase 5 | Pending |
| SYL-09 | Phase 5 | Pending |
| SYL-10 | Phase 5 | Pending |
| SYL-11 | Phase 5 | Pending |
| SYL-12 | Phase 5 | Pending |
| STU-01 | Phase 7 | Pending |
| STU-02 | Phase 5 | Pending |
| STU-03 | Phase 5 | Pending |
| STU-04 | Phase 7 | Pending |
| INS-01 | Phase 7 | Pending |
| INS-02 | Phase 7 | Pending |
| INS-03 | Phase 7 | Pending |
| INS-04 | Phase 3 | Pending |
| ADS-01 | Phase 6 | Pending |
| ADS-02 | Phase 6 | Pending |
| ADS-03 | Phase 6 | Pending |
| ADS-04 | Phase 6 | Pending |
| ADS-05 | Phase 6 | Pending |
| ADS-06 | Phase 6 | Pending |
| ADS-07 | Phase 6 | Pending |
| NOT-01 | Phase 7 | Pending |
| NOT-02 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 75 total
- Mapped to phases: 75
- Unmapped: 0

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after roadmap creation*
