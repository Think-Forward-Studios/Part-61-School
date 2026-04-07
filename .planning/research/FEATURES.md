# Feature Research

**Domain:** Flight school operations platform (Part 61 school operating like Part 141)
**Researched:** 2026-04-06
**Confidence:** MEDIUM-HIGH (competitor feature set verified via vendor docs; FAA 141.101 verified via eCFR; pain-point synthesis is MEDIUM)

## Context

The competitive set breaks into three tiers:

1. **Scheduling-first, maintenance-light** — Flight Circle, Flight Schedule Pro (classic), Schedule Master. Strong at calendars, dispatch, squawks, basic maintenance reminders. Weak at structured syllabus and training records.
2. **Training-first, 141-grade** — large-school-focused systems (used at Embry-Riddle, WMU) and FlightLogger (EASA/ATO heavy, 60K+ users, CBTA-capable). Strong at TCO-mirrored curriculum, grading, stage checks, compliance recordkeeping. Weak or absent on ADS-B and real maintenance (CAMP-style).
3. **Pilot-logbook adjacents** — Coradine LogTen Pro, MyFlightTrain. Personal logbook territory, not school ops.

**No single incumbent** unifies (a) student-driven scheduling with maintenance-aware dispatch, (b) CAMP-grade maintenance with downtime prediction, (c) 141-structured training records, and (d) live ADS-B fleet visibility. That gap IS the product thesis.

A Part 141 school is held to 14 CFR 141.101: chronological log of attendance, subjects, flight ops, test names/grades, and chief instructor certification on graduation/transfer. A Part 61 school doing this voluntarily gets professional rigor without the certification workflow — **that is the product in one sentence**.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these = the partner school won't adopt. Instructors trained on the major incumbents will immediately notice absence.

#### Scheduling

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Calendar view (day/week, per-aircraft and per-instructor) | Universal across FSP, Flight Circle, FlightLogger | MEDIUM | Split views are the default mental model |
| Student-initiated booking request with instructor approval | The core "Part 141 rigor" workflow; FSP/FlightLogger support this | MEDIUM | State machine: requested → approved → dispatched → completed → graded |
| Hard double-booking prevention (aircraft AND instructor) | Safety-relevant; silent failure is unacceptable | MEDIUM | DB-level exclusion constraint, not app-level check |
| Dispatch block when aircraft grounded or student not current | Flight Circle explicitly does this (red line on schedule) | MEDIUM | Ties scheduling to maintenance state + student endorsement state |
| Recurring lessons / series booking | FSP Intelligent Scheduling, FlightLogger progression | MEDIUM | Essential for stage-paced training |
| No-show / cancellation tracking with reason codes | Every competitor has it; feeds utilization reports | LOW | Needs a cancellation policy window |
| Civil twilight / daylight awareness on bookings | FSP GPS-integrated civil twilight is standard | LOW | Use SunCalc or similar; gates night vs day lesson eligibility |
| iCal feed / calendar subscription | Students/instructors want it on phone calendar | LOW | Read-only ICS export per user |

#### Maintenance

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-aircraft Hobbs and tach logging on flight close | Every platform has it; feeds every other maintenance calc | LOW | Enforced at dispatch-in, not trust-based |
| 100-hour, annual, transponder/pitot-static, ELT, AD tracking | FAA-mandated inspection intervals; failure = grounding | MEDIUM | Each has distinct interval rules (hours vs calendar vs recurring AD) |
| Automatic aircraft grounding when an interval expires | Flight Circle does this; users assume it | LOW | Downstream of the above: scheduler reads aircraft.grounded flag |
| Squawk/discrepancy reporting by pilots post-flight | Flight Circle Squawk Manager is the reference implementation | LOW | Visible to next pilot, reviewable by maintenance officer, can ground |
| Maintenance sign-off with mechanic identity + A&P/IA number | FAA requirement for return-to-service | LOW | Append-only audit trail, legal record |
| Document storage for airworthiness certificates, registration, insurance | Every platform offers secure upload | LOW | Simple S3-backed attachments per aircraft |
| Component lifing (engine TBO, prop, tires, battery) | CAMP-grade platforms (CAMP, Avtrak) track this; lighter platforms don't | MEDIUM | This is where most competitors get thin — a differentiator opportunity |
| Work order lifecycle (open → parts → labor → close → RTS) | Shop workflow is distinct from squawk workflow | MEDIUM | Simplified vs full shop software; mechanic hours are out-of-scope per PROJECT.md |
| Parts inventory with min levels and install tracking | Out of scope per PROJECT? — **NO, it IS scoped**; only billing is out | MEDIUM | Confirm with design partner in Phase 1 |

#### Syllabus & Training Records

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Part 141 TCO-structured syllabus (PPL, IR, Commercial SEL) | Large-school incumbents mirror TCOs exactly; this is the gold standard | HIGH | Course → Stage → Lesson → Task/Maneuver hierarchy; each lesson has objectives, completion standards, minimum hours |
| Custom syllabus support (clone and edit) | Partner school will want to deviate | MEDIUM | Versioning is important — a student mid-stream cannot have the syllabus silently changed under them |
| Per-lesson grading (task-by-task, e.g. 1–4 or CBTA competency) | FlightLogger CBTA is the modern standard; legacy is 1–4 scale | MEDIUM | Grade locks after instructor signature |
| Stage checks (end-of-stage with different/"check" instructor) | Required by 141; also a quality signal | MEDIUM | Workflow: assign check instructor, gate progression to next stage |
| Chronological training record per student (141.101-shaped) | FAA inspection readiness | MEDIUM | Append-only log; report generator that produces a 141.101-shaped export |
| Endorsement tracking (solo, XC, night, high-performance, complex, tailwheel, BFR, IPC, etc.) | Part 61.87/61.93/61.31 — universal instructor need | LOW | Template library; expiring endorsements feed scheduling currency gates |
| Digital instructor signature on lesson close | 141 compliance + audit trail | LOW | Typed + timestamp + user binding is legally sufficient for internal records |
| IACRA-friendly hours export (PIC, dual received, XC, night, IFR, etc.) | Every student needs this at checkride; feeds 8710 | MEDIUM | Category/class breakdown per 61.51(e) — non-trivial |
| Student progress dashboard (% complete, hours flown vs required) | FlightLogger Student Progression module is the reference | LOW | Derived view, no new data |

#### ADS-B Fleet Visibility

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live map of own fleet tail numbers with position, altitude, heading, speed | The pillar; ~5s update per PROJECT constraints | MEDIUM | Network feed (OpenSky/ADSBexchange/FlightAware) filtered by registration list |
| Surrounding traffic overlay | Owner explicitly wants this | MEDIUM | Bounding-box query around each fleet aircraft |
| Flight replay (last 24h per tail) | Standard in ADS-B viewers (FlightAware, ADSBexchange) | MEDIUM | Time-series storage; decimation for long flights |
| Aircraft-not-broadcasting indicator | Honesty flag; ADS-B is not 100% reliable | LOW | "Last seen X min ago" per aircraft |

#### Admin / RBAC / Cross-cutting

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Four roles (student, instructor, mechanic, admin) with UI gating | Per PROJECT.md; unified app | MEDIUM | Role on user; permissions derived, not stored separately (at v1) |
| Admin CRUD: users, aircraft, role assignment | PROJECT.md requirement | LOW | Boring but mandatory |
| Notifications: email + push (booking confirm, squawk, grounding, stage check ready) | Every platform has it | MEDIUM | Email from day 1, push when mobile lands |
| Audit trail on safety-relevant writes (scheduling, maintenance, grading) | PROJECT.md constraint; also 141.101 spirit | MEDIUM | Append-only table; never soft-delete these |
| Document vault per user (medical, license, photo ID, insurance, renters ins.) | Instructor/student expiration tracking | LOW | Expiration dates gate dispatch |
| Mobile parity for dispatch, squawks, grading, schedule | Instructors grade airborne; FlightLogger explicitly supports offline | MEDIUM-HIGH | Offline-capable grading is a stretch goal, not v1 table stakes |
| Reports: utilization by aircraft, student progress, instructor load, maintenance due | Admin needs these for business ops | MEDIUM | Derived queries; can start with 5–6 canned reports |
| Multi-tenant data isolation (even if v1 is single-tenant) | PROJECT.md constraint | MEDIUM | school_id on every row from day 1 — retrofitting is expensive |
| Authentication with 2FA option | Modern baseline | LOW | Off-the-shelf (NextAuth, Clerk, Supabase Auth) |

### Differentiators (Competitive Advantage)

Features Flight Schedule Pro and Flight Circle do not do well (or at all). These are where this product wins the partner school.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Maintenance-aware scheduler** (unified scheduling + maintenance state) | Competitors bolt these together; owner wants one source of truth so a student cannot even see bookable slots on an aircraft that will be in annual | MEDIUM | Scheduler query must join aircraft.maintenance_status — architectural, not a feature bolt-on |
| **Downtime prediction from historical data + upcoming inspections** | PROJECT.md explicit; no competitor does this | HIGH | Requires clean Hobbs history + inspection calendar; start with linear-projection heuristic before any ML |
| **141-shaped records on a 61 school** | Partner school's core pain; large-school products target 141 and are overkill, generalist scheduling tools are under-kill | HIGH | The hierarchy + grading + endorsement + export bundle IS the pillar |
| **IACRA-ready hours export with category/class breakdown** | Every student hits this at checkride; most platforms produce raw CSV | MEDIUM | Report generator that maps internal schema to 61.51(e) buckets |
| **Live ADS-B fleet map integrated with dispatch** | No school management platform does this; owner has domain comfort | MEDIUM | "Is N12345 actually airborne right now?" answerable inside the app |
| **Geofence alerts (aircraft outside training area, crossed Bravo shelf, went below floor)** | Safety differentiator; uses ADS-B data already ingested | MEDIUM | Admin defines polygons; alerts route via notifications |
| **Unified mobile app with role-gated UI** | Most competitors have separate student/instructor apps or web-only mobile | MEDIUM | React Native + Expo per PROJECT |
| **Dispatch checklist that blocks illegal flights** | "Student not current on 61.57" or "aircraft over 100hr" — hard block, not warning | LOW | Rule evaluator on dispatch; cites the FAR that blocked it |
| **Per-aircraft "next grounding event" countdown on dashboard** | Turns maintenance from reactive to planning | LOW | Min(next 100hr, next annual, next AD, next component life) |
| **Post-flight auto-draft from ADS-B track** | Reduce logging friction; pre-fill Hobbs/route/XC distance/night time from actual track | HIGH | Defer to v1.x; high value but complex and ADS-B precision-dependent |

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Integrated weather briefing / flight planning | Students want one app | Duplicates ForeFlight/Garmin Pilot which are far better; regulatory-grade weather is a huge liability surface; PROJECT.md defers this | Deep-link to ForeFlight / 1800wxbrief |
| Integrated W&B calculator | Natural fit with aircraft data | Every aircraft has unique loading charts; wrong answer = bent airplane or paperwork violation; liability | Store W&B PDFs in aircraft documents |
| Student tuition billing / Stripe integration | Schools want one system | Aviation billing has pay-as-you-fly, block-time accounts, instructor split, fuel surcharge — it's a product of its own; PROJECT.md defers | Export utilization to QuickBooks/Xero |
| Mechanic labor hours / shop billing | Natural adjacency to maintenance | PROJECT.md explicit out-of-scope; it's a different product (ShopController, etc.) | Track sign-off only |
| Local ADS-B receiver ingestion (dump1090/PiAware) | Owner has ADS-B background | Hardware dependency, per-school install, support burden; PROJECT.md defers | Network feed (OpenSky etc.) |
| Actual Part 141 certification workflow / DPE portal | Seems like the natural extension | Certification is FAA-dictated paperwork; trying to automate it invites liability; PROJECT.md explicit out-of-scope | Mirror the structure; let schools file their own 141 if they ever want it |
| "Real-time everything" (live edit, presence, collaborative grading) | Modern UX trend | Scheduling/maintenance don't need it; adds infra (websockets, CRDT) with no user value | Polling/SSE only for ADS-B map; everything else is request/response |
| AI lesson plan generator | Trendy; FlightLogger shipped AI student summaries | FAA records must be instructor-authored; AI-generated grades are a compliance and liability landmine | AI for *summaries* of existing records is fine (read-only); never AI-authored grades |
| Replace the paper logbook | Students ask for it | FAA still expects a logbook for checkride; duplicate of truth creates drift | Export to LogTen Pro / ForeFlight logbook formats |
| Per-user pricing | SaaS default | Penalizes school growth (competitor complaint); partner school will resent it | Per-aircraft pricing (Flight Circle's $10/ac/mo is the market anchor) — product decision, not v1 feature, but record the intent |

## Feature Dependencies

```
Auth + RBAC + Multi-tenant isolation
    └──required by──> EVERYTHING ELSE

Aircraft CRUD + Hobbs/Tach ground truth
    ├──required by──> Maintenance intervals
    ├──required by──> Scheduling (aircraft.grounded flag)
    └──required by──> ADS-B fleet filter (tail list)

Maintenance intervals + Squawks
    └──required by──> Maintenance-aware dispatch
                          └──required by──> Downtime prediction

Student/Instructor CRUD + Endorsements + Document vault
    └──required by──> Dispatch currency checks
                          └──required by──> Scheduling approval flow

Syllabus hierarchy (Course → Stage → Lesson → Task)
    ├──required by──> Lesson grading
    ├──required by──> Stage checks
    └──required by──> Progress dashboard + 141.101 export

Lesson grading + Endorsements + Hours
    └──required by──> IACRA export

ADS-B ingestion + Fleet registration list
    ├──required by──> Live map
    ├──required by──> Replay
    ├──required by──> Geofence alerts
    └──enhances────> Post-flight auto-draft (v1.x)

Notifications infra
    └──enhances──> Squawks, grounding events, stage check ready, geofence alerts
```

### Dependency Notes

- **Multi-tenant from day 1:** `school_id` on every table. Retrofitting tenancy into a single-tenant schema is one of the biggest rewrite risks in SaaS. PROJECT.md calls this out; honor it.
- **Maintenance-aware dispatch is architectural:** This cannot be bolted on. The scheduler's query for "available aircraft" must include the maintenance join from the first implementation, or the differentiator collapses into another bolt-on.
- **ADS-B ingestion is independent:** Can be built in parallel with everything else; the only coupling is "which tail numbers to filter" (reads aircraft table).
- **Syllabus grading locks the schema:** Once real student records exist, changing the syllabus shape is painful. Version the syllabus structure from day 1. Students are enrolled in a *version* of a syllabus, not the syllabus itself.
- **Downtime prediction needs history:** Cannot ship in v1 meaningfully; needs 3–6 months of Hobbs data per aircraft. v1 ships the deterministic "next grounding countdown"; v1.x ships the prediction.

## MVP Definition

### Launch With (v1) — "A Part 61 school can actually use this"

The bar: partner school could move off their current scheduling tool onto this and not lose capability, while gaining training records and ADS-B visibility.

- [ ] Auth + RBAC (4 roles) + multi-tenant schema + admin CRUD
- [ ] Aircraft CRUD with Hobbs/tach, document vault, grounded flag
- [ ] Maintenance intervals (100hr, annual, ELT, transponder, AD list) with auto-ground on expiry
- [ ] Squawk manager (report → review → ground-or-defer → RTS sign-off)
- [ ] Scheduler: request/approve flow, double-booking prevention, dispatch block on grounded aircraft or non-current student, basic cancellation
- [ ] Syllabus: one seeded PPL 141-style TCO template + ability to clone/edit; lesson grading; stage checks; endorsement library
- [ ] Student training record (141.101-shaped chronological log) + progress dashboard
- [ ] IACRA-friendly hours export (CSV with 61.51(e) buckets)
- [ ] ADS-B live map (fleet only, ~5s update, network feed) with "last seen"
- [ ] Notifications: email only (push in v1.x)
- [ ] Web (Next.js) full coverage + mobile (Expo) covering: schedule view, booking, squawk, dispatch, grading
- [ ] Audit trail on scheduling, maintenance, grading writes
- [ ] Canned reports: fleet utilization, maintenance due in 30 days, student progress, instructor load

### Add After Validation (v1.x)

- [ ] Surrounding traffic overlay on ADS-B map — after fleet-only proves value and cost
- [ ] Flight replay (per tail, 24h) — once ADS-B time-series storage stabilizes
- [ ] Geofence alerts — needs admin polygon editor
- [ ] IR and Commercial 141-style TCO templates — PPL validates the shape first
- [ ] Push notifications on mobile
- [ ] Downtime prediction (linear projection from Hobbs history)
- [ ] Component lifing (engine TBO, prop, tires)
- [ ] Parts inventory with min levels
- [ ] Work order lifecycle
- [ ] Offline grading on mobile (FlightLogger-style)

### Future Consideration (v2+)

- [ ] Post-flight auto-draft from ADS-B track
- [ ] CBTA competency-based grading layer (alongside 1–4 scale)
- [ ] Additional school onboarding (true multi-tenant SaaS; v1 is single-tenant deploy on multi-tenant schema)
- [ ] Stripe billing / block-time accounts (PROJECT.md v2)
- [ ] Local ADS-B receiver support (PROJECT.md v2)
- [ ] Logbook export to LogTen Pro / ForeFlight formats
- [ ] Chief instructor digital graduation certification (141.95-shaped)
- [ ] ML-based downtime prediction

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Auth + RBAC + multi-tenant schema | HIGH | MEDIUM | P1 |
| Aircraft CRUD + Hobbs/tach | HIGH | LOW | P1 |
| Maintenance intervals + auto-ground | HIGH | MEDIUM | P1 |
| Squawk manager | HIGH | LOW | P1 |
| Scheduler (request/approve, no double-book, maintenance-aware) | HIGH | MEDIUM | P1 |
| PPL 141-style syllabus template + grading + stage checks | HIGH | HIGH | P1 |
| Endorsement library + document vault | HIGH | LOW | P1 |
| 141.101 chronological training record | HIGH | MEDIUM | P1 |
| IACRA hours export | HIGH | MEDIUM | P1 |
| ADS-B fleet-only live map | HIGH | MEDIUM | P1 |
| Audit trail | HIGH (compliance) | MEDIUM | P1 |
| Email notifications | MEDIUM | LOW | P1 |
| Mobile parity for core flows | HIGH | HIGH | P1 |
| Canned admin reports | MEDIUM | LOW | P1 |
| Surrounding traffic overlay | MEDIUM | MEDIUM | P2 |
| Flight replay | MEDIUM | MEDIUM | P2 |
| Geofence alerts | MEDIUM | MEDIUM | P2 |
| IR/Commercial syllabus templates | HIGH | MEDIUM | P2 |
| Downtime prediction | MEDIUM | HIGH | P2 |
| Component lifing | MEDIUM | MEDIUM | P2 |
| Work orders + parts inventory | MEDIUM | MEDIUM | P2 |
| Push notifications | MEDIUM | LOW | P2 |
| Offline mobile grading | MEDIUM | HIGH | P2 |
| Post-flight auto-draft from ADS-B | HIGH | HIGH | P3 |
| CBTA competency layer | MEDIUM | HIGH | P3 |
| Billing / Stripe | HIGH | HIGH | P3 (out of scope v1 per PROJECT) |

## Competitor Feature Analysis

| Feature | Generalist scheduler | Maintenance-aware scheduler | Large-school 141 system | EASA-focused training | Our Approach |
|---|---|---|---|---|---|
| Scheduling | Strong (Intelligent Scheduling) | Strong, maintenance-linked | Strong, curriculum-linked | Strong | Maintenance-linked + currency-linked + mobile-first |
| Squawks | Basic | **Reference impl** (Squawk Manager, grounds aircraft) | Light | Light | Match Flight Circle, add mechanic RTS sign-off |
| Maintenance intervals | Basic reminders | Reminders + grounding | Light | Light | Full CAMP-lite: intervals + component lifing (v1.x) + auto-ground |
| Downtime prediction | No | No | No | No | **Differentiator** (v1.x) |
| 141 TCO syllabus | Partial (Next Gen Training) | No | **Reference impl** (mirrors TCO) | Strong (CBTA) | PPL TCO in v1, clone-and-edit, versioned enrollments |
| Stage checks | Yes | No | Yes | Yes | Yes, check-instructor workflow |
| Grading | Basic | No | Yes | **Reference impl** (airborne, offline) | 1–4 scale v1; CBTA v2; offline mobile v1.x |
| Endorsements | Yes | Partial | Yes | Yes | Template library with expiry → dispatch block |
| 141.101 records | Partial | No | **Reference impl** | Strong | Match the large-school shape; simpler UI |
| IACRA export | Partial | No | Yes | Partial | First-class, with 61.51(e) breakdown |
| ADS-B live map | **No** | **No** | **No** | **No** | **Differentiator** |
| Geofence alerts | No | No | No | No | **Differentiator** (v1.x) |
| Mobile | Yes, web-based | Yes | Web-only / light | Strong native | Full native via Expo, role-gated |
| Billing | Yes | Yes | Yes | Yes | **Deliberately not in v1** (PROJECT.md) |
| Pricing model | Per user (complaint) | Per aircraft ($10/mo) | Enterprise quote | Per user | Per aircraft (align to Flight Circle anchor; product decision, not feature) |

**Summary of the gap:** No competitor unifies real maintenance + 141-grade records + ADS-B. The large-school 141 systems own training records but ignore ADS-B and aren't maintenance-first. Maintenance-aware schedulers own squawks but have no syllabus. The generalist schedulers do none of the three deeply. **That three-way gap is the product.**

## Sources

- [Flight Schedule Pro — Flight School Scheduling Software](https://www.flightschedulepro.com/platform/flight-school-scheduling-software) (MEDIUM — vendor marketing)
- [Flight Schedule Pro — Next Gen Platform](https://www.flightschedulepro.com/blog/flight-schedule-pro-releases-boosted-next-gen-platform) (MEDIUM)
- [Flight Circle](https://www.flightcircle.com/) and [Squawks / Discrepancies docs](https://www.flightcircle.com/blog/docs/administrators/squawks/) (HIGH — product docs)
- [Flight Circle — Maintenance Reminders docs](https://www.flightcircle.com/blog/docs/administrators/aircraft/maintenance-reminders/) (HIGH)
- (Large-school 141 management vendor docs — references redacted at owner request)
- [FlightLogger — Logging & Grading](https://flightlogger.net/features/logging-grading/) (MEDIUM)
- [FlightLogger — Who is it for](https://flightlogger.net/whoisitfor/) (MEDIUM)
- [Louisiana Tech PPL Airplane TCO (real 141 TCO example)](https://liberalarts.latech.edu/documents/2025/08/private-pilot-airplane-tco.pdf) (HIGH — primary source)
- [Louisiana Tech Instrument TCO](https://liberalarts.latech.edu/documents/2025/08/instrument-pilot-airplane-tco.pdf) (HIGH)
- [Louisiana Tech Commercial TCO](https://liberalarts.latech.edu/documents/2025/08/commercial-pilot-airplane-tco.pdf) (HIGH)
- [FAA AC 141-1B — Pilot School Certification](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_141-1B.pdf) (HIGH — FAA primary)
- [14 CFR 141.101 — Training records (Cornell LII)](https://www.law.cornell.edu/cfr/text/14/141.101) (HIGH — regulatory primary)
- [eCFR — 14 CFR Part 141](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-H/part-141) (HIGH)
- [Aviatize — Best Flight School Management Software 2026](https://www.aviatize.com/blog/best-flight-school-management-software-2026) (MEDIUM — industry analysis)
- [Aviatize — Flight Scheduling Software 2025](https://www.aviatize.com/blog/flight-scheduling-software-what-to-look-for-in-2025) (MEDIUM — pricing complaints sourced here)
- [Aviatize — Part 61 vs Part 141](https://www.aviatize.com/blog/part-61-vs-part-141) (MEDIUM — admin burden figures)

---
*Feature research for: flight school operations (Part 61 school, 141-style structure)*
*Researched: 2026-04-06*
