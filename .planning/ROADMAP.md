# Roadmap: Part 61 School

**Created:** 2026-04-06
**Depth:** Standard
**Phases:** 7
**Coverage:** 75/75 v1 requirements mapped

## Core Value

Give a Part 61 school a single source of truth for fleet, training, and scheduling so it can operate as professionally as a 141 school. All four pillars (scheduling, maintenance, syllabus, ADS-B) must work cohesively in v1.

## Phases

- [ ] **Phase 1: Foundation & Terminology Contract** - Multi-tenant RLS, auth, audit scaffolding, banned-term lint, document storage
- [ ] **Phase 2: Fleet Primitives & Admin CRUD** - Multi-clock aircraft model, user/aircraft admin, document vault, admin dashboard
- [ ] **Phase 3: Scheduling & Dispatch** - Reservations with DB-level conflict prevention, approval workflow, calendar views, stubbed airworthiness gate
- [ ] **Phase 4: CAMP Maintenance** - Real `isAirworthyAt`, inspections, ADs, squawks, work orders, parts, logbook export, downtime prediction
- [ ] **Phase 5: Syllabus & Training Records** - Versioned TCO-shaped syllabuses, lesson grading, stage checks, endorsements, 141.101 + IACRA exports, currency
- [ ] **Phase 6: ADS-B Fleet Integration** - Integrate existing ADS-B Tracker service: live fleet map, deep-links, geofence, flight replay
- [ ] **Phase 7: Experience, Notifications & Beta Hardening** - Role dashboards, in-app + email notifications, canned reports, beta polish

## Phase Details

### Phase 1: Foundation & Terminology Contract
**Goal**: Safety-relevant, multi-tenant-ready platform foundation that cannot be retrofitted later.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08
**Success Criteria** (what must be TRUE):
  1. A user can sign up, verify email, log in, stay logged in across refresh, and log out; session is bound to a `school_id` claim
  2. Any attempt to read or write data from another school's tenant fails at the database level (verified by an automated cross-tenant RLS test harness)
  3. The four roles (Student, Instructor, Mechanic with A&P/IA designation, Admin) exist and role checks are enforced server-side, not only in the UI
  4. Every mutation to a safety-relevant table writes an append-only audit row recording who, what, when; hard-delete is impossible on training/maintenance records
  5. CI fails any PR that introduces the banned terms ("Part 141", "approved", "certified course") in user-facing UI or export templates
  6. A user can upload a document (medical, license, insurance) to their profile and retrieve it via a signed URL, with an expiration date captured
**Plans**: TBD

### Phase 2: Fleet Primitives & Admin CRUD
**Goal**: Aircraft and people exist as first-class records with correct multi-clock time tracking before anything depends on them.
**Depends on**: Phase 1
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, FLT-01, FLT-02, FLT-03, FLT-05, FLT-06
**Success Criteria** (what must be TRUE):
  1. An admin can create, edit, soft-delete students, instructors, mechanics (with A&P/IA designation), and can assign/change roles on any user
  2. An admin can create, edit, soft-delete aircraft with tail number, make/model/year, equipment list, home base, and photo
  3. Each aircraft carries independent Hobbs, tach, airframe, and per-engine time series; current totals are computed as queries over an append-only `flight_log_entry` event log, never as a mutable column
  4. An aircraft profile page shows totals, equipment, and recent flight log entries; an admin dashboard shows every aircraft with airworthy / grounded status at a glance
  5. A school-level settings screen lets an admin configure name, timezone, and default home base
**Plans**: TBD

### Phase 3: Scheduling & Dispatch
**Goal**: Students can request flights and the system makes double-booking and flying an unairworthy aircraft structurally impossible.
**Depends on**: Phase 2
**Requirements**: SCH-01, SCH-02, SCH-03, SCH-04, SCH-06, SCH-07, SCH-08, SCH-09, INS-04, FLT-04
**Success Criteria** (what must be TRUE):
  1. A student can request a reservation (aircraft + instructor + start/end + lesson reference + remarks); an instructor or admin must approve before it is confirmed
  2. Two overlapping confirmed reservations on the same aircraft or same instructor are rejected by a Postgres `EXCLUDE USING gist` constraint on `tstzrange` (verified by a concurrent-insert test)
  3. A reservation cannot be confirmed for an aircraft whose `isAirworthyAt(reservation_start)` is false (initially stubbed on grounded flag; Phase 4 replaces the stub)
  4. Calendar views exist by aircraft, by instructor, by student, and by day/week/month; recurring reservations ("every Tue/Thu 4pm for 6 weeks") can be created in one action
  5. A reservation moves through requested → approved → dispatched → flown → closed → archived; no-show, weather scrub, and cancellation are distinct close-out states each requiring a reason
  6. At flight close an instructor captures Hobbs/tach in/out, fuel, oil, route, and any observed squawks, producing new entries in the aircraft event log
**Plans**: TBD

### Phase 4: CAMP Maintenance
**Goal**: The aircraft the schedule says are airworthy actually are, with FAA-inspection-ready records behind every claim.
**Depends on**: Phase 3
**Requirements**: MNT-01, MNT-02, MNT-03, MNT-04, MNT-05, MNT-06, MNT-07, MNT-08, MNT-09, MNT-10, MNT-11
**Success Criteria** (what must be TRUE):
  1. Every maintenance item (100hr, annual, AD, oil, transponder, ELT, pitot-static, etc.) is typed and declares which clock (Hobbs / tach / airframe / calendar) its interval is measured against, and surfaces a deterministic "next due" date or hours
  2. When an aircraft crosses any compliance limit, the system auto-grounds it; a confirmed reservation that now sits on a non-airworthy aircraft is flagged, and the only path to overfly is an explicit IA-recorded §91.409 10-hour overrun justification
  3. A squawk can be opened by any user, triaged by a mechanic, ground the aircraft if severe, and be returned to service only by a qualified A&P or IA whose certificate type and number are snapshotted into the sign-off record
  4. A work order flows create → assign mechanic → tasks → parts consumed (decrementing parts inventory with lot/serial where applicable) → sign-off by A&P or IA based on task type → return-to-service, and an airframe/engine/prop digital logbook PDF export is produced with timestamped signed entries
  5. Admin dashboard and each aircraft profile display a "next grounding event" countdown and a rule-based downtime forecast for upcoming 100hr/annual using scheduled reservations and historical squawk-repair averages
  6. The Phase 3 `isAirworthyAt()` stub is fully replaced by real rules derived from inspection state, open squawks, AD compliance, and component lifing; AD records are first-class entities with applicability, method, due-at rule, and compliance history — never free text
**Plans**: TBD

### Phase 5: Syllabus, Training Records & Exports
**Goal**: A student's training is structured like a 141 course, locked once started, and exportable in formats an FAA inspector recognizes.
**Depends on**: Phase 4
**Requirements**: SYL-01, SYL-02, SYL-03, SYL-04, SYL-05, SYL-06, SYL-07, SYL-08, SYL-09, SYL-10, SYL-11, SYL-12, SCH-05, STU-02, STU-03
**Success Criteria** (what must be TRUE):
  1. The system ships seeded Course → Stage → Lesson → Task templates for Private Pilot, Instrument, and Commercial Single-Engine; a school can fork a template or author a custom syllabus, and published revisions never mutate a student's enrolled version
  2. A student can be enrolled in one or more syllabuses; after a flight an instructor grades each lesson task on a defined scale, and the grade is append-only with an electronic signature and timestamp
  3. A stage check assigned to a different instructor records pass/fail with remarks and gates progression; endorsements drawn from an AC 61-65 library are captured in the training record with date and instructor signature
  4. A complete chronological training record per student (lessons, grades, endorsements, stage checks, sign-offs) can be exported as a 141.101-shaped PDF, and an IACRA-friendly hours summary broken out by 61.51(e) category/class can be exported
  5. Currency tracking (BFR, IPC, medical class + expiration, solo scope + expiration, day/night/PIC) is surfaced on the student profile and blocks SCH-05: a reservation cannot be confirmed if the student is missing a required prerequisite for that flight
  6. A student can view their own training record read-only and download the PDF, and view their flight log with totals by PIC/dual/solo/XC/night/IFR categories
**Plans**: TBD

### Phase 6: ADS-B Fleet Integration
**Goal**: The school can see where its aircraft actually are in real time, without duplicating the existing ADS-B Tracker stack.
**Depends on**: Phase 2 (needs aircraft tail numbers); can start in parallel with Phase 5 after Phase 4
**Requirements**: ADS-01, ADS-02, ADS-03, ADS-04, ADS-05, ADS-06, ADS-07
**Success Criteria** (what must be TRUE):
  1. The school app calls the existing ADS-B Tracker REST API (default port 3002, configurable) behind an `AdsbProvider` interface; no ADS-B ingestion logic is duplicated inside this app
  2. A live fleet map view shows every school aircraft (matched by tail number to the Tracker feed) with current position, altitude, speed, heading, and last-update age, refreshing at a cadence that feels live (~5s target)
  3. The same map can render surrounding traffic in a configurable bbox (default: school home airport area) using the Tracker's bbox endpoints, clearly visually distinguished from school aircraft
  4. Clicking a school aircraft on the map deep-links to its aircraft profile showing current reservation, fleet status, and recent flights; a "flight track replay" view renders the most recent flight from the Tracker's `/api/swim/tracks` endpoint
  5. An admin can define a training-area geofence; the system raises an alert when a school aircraft is observed outside it
**Plans**: TBD

### Phase 7: Experience, Notifications & Beta Hardening
**Goal**: The app feels like a single coherent product to each role and is ready for the partner school to actually run operations on it.
**Depends on**: Phases 1-6
**Requirements**: STU-01, STU-04, INS-01, INS-02, INS-03, SCH-10, NOT-01, NOT-02
**Success Criteria** (what must be TRUE):
  1. A student dashboard shows next reservation, current syllabus progress, currency status, outstanding squawks on their next aircraft, and any expiring documents; a student can upload medical / license / ID documents directly to their profile
  2. An instructor dashboard shows today's schedule, assigned students, pending grade entries, and pending stage checks; an instructor can grade a lesson, sign endorsements, and approve reservation requests from a single workflow and can view any of their students' records read+grade
  3. Every relevant event (reservation request / approve / change / reminder, grading complete, squawk opened / grounding / return-to-service, document expiring, currency expiring) produces an in-app notification and a per-user-configurable email notification
  4. A beta readiness checklist passes: CFI review of all export templates for terminology compliance, E2E tests covering the safety-critical flows (scheduling conflict, airworthiness gate, sign-off authority, currency block), and a partner-school onboarding runbook exists
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Terminology Contract | 0/0 | Not started | - |
| 2. Fleet Primitives & Admin CRUD | 0/0 | Not started | - |
| 3. Scheduling & Dispatch | 0/0 | Not started | - |
| 4. CAMP Maintenance | 0/0 | Not started | - |
| 5. Syllabus, Training Records & Exports | 0/0 | Not started | - |
| 6. ADS-B Fleet Integration | 0/0 | Not started | - |
| 7. Experience, Notifications & Beta Hardening | 0/0 | Not started | - |

---
*Roadmap created: 2026-04-06*
