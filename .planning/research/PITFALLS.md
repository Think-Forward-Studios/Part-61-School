# Pitfalls Research

**Domain:** Flight school operations platform (scheduling + CAMP maintenance + 141-style syllabus + ADS-B fleet tracking) for a Part 61 school
**Researched:** 2026-04-06
**Confidence:** MEDIUM-HIGH (regulatory claims verified against 14 CFR; ADS-B feed terms verified against provider sites; some operational/UX pitfalls drawn from aviation community discussion — marked where applicable)

This file catalogs what actually goes wrong when building this class of product. It is deliberately specific to aviation/flight-school operations — generic SaaS pitfalls are omitted except where they compound with a domain issue. Each critical pitfall has a warning-sign list and a roadmap phase hook so it can be wired into the roadmap directly.

---

## Critical Pitfalls

### Pitfall 1: Calling the product "Part 141" or implying FAA-approved curriculum

**What goes wrong:**
Marketing copy, UI labels, or exported PDFs use phrases like "Part 141 training record," "141-approved syllabus," "FAA-approved course," or "stage check certification." The school is certificated under Part 61. An FAA inspector (FSDO) or a DPE sees the paperwork and concludes the school is either holding itself out as a 141 school (unauthorized) or confusing students about the training they received.

**Why it happens:**
Developers shorten "141-style structure" to "141" in UI strings. Template syllabi get copied from real 141 TCOs (Training Course Outlines) and retain the 141-specific language. Export templates borrow headers from real 141 gradesheets without rewriting them.

**Consequences:**
FAA enforcement action against the partner school. Students misled about whether their training counts toward reduced 141 hour minimums (it doesn't under Part 61). Immediate rewrite of every user-facing string, template, and exported PDF. Potential liability if a student-pilot applicant is denied a checkride for paperwork misrepresentation.

**How to avoid:**
- Establish a terminology contract in Phase 1: never use "Part 141," "141 course," "approved," or "certified" in any user-facing string. Use "141-style," "structured syllabus," "stage-style check," "internal progress review."
- Add a lint rule / CI check that greps UI strings, email templates, and PDF templates for banned words.
- Every exported document must carry a footer: "Training conducted under 14 CFR Part 61. Not an FAA-approved Part 141 course."
- Have a CFI (ideally the design-partner school's chief instructor) review all template syllabi and all export formats before beta.

**Warning signs:**
- PR diffs containing the literal string "Part 141" outside of comments/docs
- Template imports from public 141 TCOs without a rewrite step
- Marketing site referring to "certification" or "approved training"

**Phase to address:** Phase 1 (foundation / terminology contract), re-verified before any beta release

---

### Pitfall 2: Training records that don't survive an FAA ramp check or records inspection

**What goes wrong:**
Under 14 CFR §61.189, a flight instructor must retain certain records (solo endorsements, test endorsements) for **at least 3 years**. Student pilots must retain their own logbook with instructor endorsements per §61.51. The school builds a system where:
- Deleting a student wipes their training history (hard delete)
- An instructor leaving the school takes their endorsement history with them
- Logbook-style endorsements exist only as database rows with no immutable signed artifact
- There is no way to print / export a given student's complete training file on demand in an FAA-inspector-friendly format

**Why it happens:**
Developers model endorsements as mutable rows in a normal relational table, use foreign-key cascades, and assume "we have backups." The domain requirement is **audit-grade immutability and on-demand export**, not just "data exists in the DB."

**Consequences:**
During an FSDO visit or a post-incident investigation, the school cannot produce the complete training file for a pilot. That's a finding against the school, and in a post-accident context it's a liability multiplier. Also triggers a rewrite because fixing it after the fact means reconstructing history from backups.

**How to avoid:**
- Model training events, endorsements, and stage checks as **append-only** (event-sourced or insert-only with `superseded_by`). Never UPDATE, never DELETE.
- Every endorsement record stores: CFI name, CFI certificate number, CFI cert expiration, student name, date, endorsement text (verbatim from AC 61-65 current revision), and a hash.
- Hard-delete of students is disabled at the DB layer (soft delete only, with a minimum retention of 7 years to be safely above the 3-year §61.189 floor and comfortably past typical statute-of-limitations for training-related claims).
- Build a "Student Training File" PDF export early — this is the artifact an inspector would actually look at. If you can't produce it, records are not done.
- Include instructor departure workflow: when a CFI leaves, their historical endorsements stay attached to student records and remain viewable.

**Warning signs:**
- Any `DELETE FROM students` or `ON DELETE CASCADE` touching training data
- UI that says "Edit endorsement" without an audit trail of the prior value
- No end-to-end test that exports a complete student file as PDF

**Phase to address:** Phase 2 or wherever training records land — must be designed in from day one, not retrofitted

---

### Pitfall 3: Hobbs vs tach vs flight-time confusion in maintenance math

**What goes wrong:**
The system tracks "aircraft time" as a single number. But real aircraft have (at least) **Hobbs time** (oil-pressure-activated, runs in real time), **tach time** (scaled by RPM, usually runs slower than Hobbs), and **flight time / air time** (wheels-up to wheels-down). Inspections and component lifing are pegged to different clocks:
- 100-hour inspection (§91.409(b)) is typically tracked on tach
- Engine TBO is typically tach
- Some ADs are calendar-based, some are hour-based, some are cycle-based
- Hobbs is what students are billed on

Mixing these or silently converting between them produces a flyable airplane the system thinks is legal but isn't (or vice versa — grounding an airplane unnecessarily).

**Why it happens:**
Developer builds one `hours` column. Mechanic enters Hobbs during oil change, student enters tach during flight close-out. Now two different values are being written to the same column.

**Consequences:**
An aircraft flies past its 100-hour inspection because the system was tracking Hobbs when the inspection is scheduled on tach (§91.409). That's an airworthiness violation, grounds the aircraft, and — if discovered after an incident — is a direct contributing factor in an NTSB finding. Full rewrite of the maintenance ledger.

**How to avoid:**
- Model each aircraft with **multiple independent time series**: Hobbs, tach, airframe total time, engine time (per engine), prop time. Never a single "hours" field.
- Every flight close-out captures **start/end for each clock the aircraft has**. Never derive one from the other.
- Every inspection / AD / component life limit declares **which clock it is measured against**. The compliance engine only compares like-to-like.
- Require monotonicity (Hobbs/tach can only go up) and plausibility checks (Hobbs delta vs scheduled flight duration within tolerance, flag outliers for review — do not auto-correct).
- Separate "billing clock" (what the student pays on) from "maintenance clock" (what airworthiness is computed on). They are different concerns.

**Warning signs:**
- A single column named `hours` or `total_time` on the aircraft table
- Any code that multiplies tach by a constant to "convert" to Hobbs
- Mechanic and student writing to the same field from different forms

**Phase to address:** Maintenance phase — foundational data model, cannot be retrofitted without data migration

---

### Pitfall 4: AD (Airworthiness Directive) compliance tracked as free-text notes

**What goes wrong:**
Airworthiness Directives are FAA-issued mandatory actions against specific aircraft, engines, or components. Some are one-time, some are recurring (every N hours or calendar interval), some are conditional on serial-number ranges or prior modifications. The system implements "AD tracking" as a notes field or a flat list of "AD number + compliance date." It cannot answer: "Is N12345 currently in compliance with all applicable ADs?"

**Why it happens:**
AD data is not available as a clean machine-readable feed for most GA aircraft (the FAA publishes ADs as PDFs). Building a real AD compliance engine means modeling applicability (make/model/serial/component), recurrence intervals, and supersession — which is expensive. So teams defer and ship a notes field.

**Consequences:**
Owner of the partner school assumes the software is tracking ADs; mechanic assumes the paper 8130s / yellow tags are authoritative. Both assumptions leave gaps. An overflown recurring AD is exactly the kind of finding that causes enforcement and grounds the fleet.

**How to avoid:**
- Explicitly scope v1: the system **tracks** AD compliance (records, reminds, exports) but the **A&P/IA is the source of truth** and must sign off every AD entry. Make this a contractual statement in the app UI and in onboarding.
- Model ADs as first-class entities: AD number, applicability (make/model/serial range), recurrence (none / N hours / N calendar), last-complied date + clock reading, next-due date + clock reading, signing mechanic + cert number, reference to the work order.
- Do not attempt to auto-import the FAA AD library in v1. Have the mechanic enter applicable ADs per tail during onboarding.
- Distinguish "recurring AD" from "one-time AD" in the schema. A recurring AD without a next-due calculation is a bug.
- Any compliance dashboard that shows "green" must list which ADs it considered — never claim compliance for ADs it doesn't know about. Show an explicit "ADs on file: N" count.

**Warning signs:**
- AD data stored in a `notes` or `comments` text field
- No distinction between recurring and one-time ADs in the schema
- A compliance dashboard that shows "green" with zero ADs entered

**Phase to address:** Maintenance phase — AD model must ship alongside inspection tracking or the maintenance module is not meaningfully complete

---

### Pitfall 5: Unqualified maintenance sign-off (wrong person releases aircraft for service)

**What goes wrong:**
Under 14 CFR Part 43, only specific people can return an aircraft to service after maintenance: a certificated A&P (Airframe & Powerplant) mechanic for most maintenance, an IA (Inspection Authorization holder) for annual inspections and major repairs/alterations, the manufacturer or a repair station for certain work. A student or unlicensed helper cannot sign off. The system lets anyone with a "mechanic" role click "complete" on a work order.

**Why it happens:**
RBAC is modeled as a single "mechanic" role. No concept of certificate type, certificate number, or IA authority.

**Consequences:**
Forged or invalid return-to-service entries. The aircraft is technically unairworthy. Every work order signed off by the wrong person must be re-inspected and re-signed. Potential FAA enforcement against both the school and the unqualified signer.

**How to avoid:**
- Mechanic user records store: certificate type (A&P, IA, Repairman), certificate number, expiration (if applicable), scope (airframe / powerplant / both).
- Work order types declare the minimum authority required (e.g., annual inspection → requires IA; 100-hour → requires A&P; preventive maintenance per Part 43 App A → pilot-owner allowed for owner-operated aircraft, which typically does NOT apply to a school's rental fleet).
- Sign-off UI refuses to complete a work order if the signing user does not hold the required authority. No "override" without a second IA co-sign and an audit entry.
- Every sign-off snapshots the mechanic's cert number and type at the time of signature (not a live FK — if the mechanic updates their cert later, historical records must show what was true at the moment of signing).

**Warning signs:**
- A single "mechanic" boolean or role with no cert type
- Work-order completion endpoint with no authority check
- Ability to edit a completed work order without a new signature

**Phase to address:** Maintenance phase — RBAC design must precede the work-order module

---

### Pitfall 6: Scheduling double-booking under concurrency + timezone bugs

**What goes wrong:**
Two students simultaneously click "Book N12345 for 10:00 on Saturday." Both requests are approved. The aircraft is now double-booked. Or: the school is in Arizona (no DST) but a student traveling is on PDT; a booking shows up at the wrong local time. Or: instructor is booked in aircraft A while simultaneously also booked with a different student in aircraft B — the triple (instructor, aircraft, student) was never checked as a composite constraint.

**Why it happens:**
- Optimistic reads without a transactional check-and-insert for the time range
- Storing times as local strings ("Sat 10:00") or as naive timestamps without tz
- Constraint checking only on aircraft resource, not on instructor or student

**Consequences:**
A student shows up to a reserved aircraft that's already flying. Worse: a CFI is scheduled to fly two different students at the same time and one of them flies solo without the required endorsement because "the system said I was booked with an instructor."

**How to avoid:**
- Store all timestamps in UTC with timezone stored separately on the school record. Display conversion is a UI concern only. Never trust client-supplied local time for conflict detection.
- Use PostgreSQL `tstzrange` + `EXCLUDE USING gist` constraints to enforce non-overlap at the database level. This is the only place double-booking cannot slip through under concurrency.
  - One exclusion constraint per resource type: per-aircraft, per-instructor, per-student.
- Treat a booking as a multi-resource reservation: it simultaneously reserves the aircraft, the instructor, AND the student during the same time window. All three constraints must pass in a single transaction.
- Explicit handling of DST transitions (display) and no-DST zones like Arizona (common gotcha for Southwest-US flight schools). Test with Phoenix and Indianapolis as fixtures.
- Weather-scrub workflow: "scrub" is a distinct state from "cancel" and "no-show." Preserves the reservation for stats and billing but releases the resources.

**Warning signs:**
- Any use of `timestamp` (without time zone) columns for booking times
- Conflict detection in application code rather than DB constraint
- Only aircraft is checked for conflicts; instructor/student overlap is ignored

**Phase to address:** Scheduling phase — DB constraint design is the foundation, not a polish item

---

### Pitfall 7: ADS-B feed terms-of-service violations (redistribution / display rights)

**What goes wrong:**
The system pulls live traffic from OpenSky, ADSBexchange, or FlightAware and re-displays it in the school's web and mobile app. Each of these feeds has terms that restrict commercial and/or redistribution use:

- **OpenSky Network**: Data is provided for **non-commercial / research use**. Commercial use requires a separate agreement. A paid flight-school SaaS is commercial even if the flight school itself is a non-profit.
- **ADS-B Exchange**: Terms of Use explicitly prohibit bulk resale or redistribution without consent. Commercial use (for-profit or non-profit organization) requires written authorization and a commercial data license. The low-cost RapidAPI tier is "personal use" only.
- **FlightAware (AeroAPI / Firehose)**: Commercial API with per-query and per-position pricing. Re-display rights depend on the license tier and typically require attribution; Firehose redistribution is governed by a separate commercial agreement. (Confirm with current contract before launch.)

**Why it happens:**
Developer finds a free/cheap API, builds on it for v1, and assumes "we'll sort out licensing later." By the time the product is in front of a paying customer, the cost to switch feeds is high because UI, rate-limiting, and data model have been tuned to a specific feed's schema.

**Consequences:**
Cease-and-desist from the feed provider. API key revoked mid-operation — map goes blank during training flights. Potential back-billing at commercial rates. Reputation damage if the partner school has to disable a feature they relied on.

**How to avoid:**
- **Before writing any ADS-B code, pick the feed and execute the commercial license**. For a multi-tenant SaaS aspiration, the realistic options are (a) a paid commercial FlightAware AeroAPI/Firehose tier, (b) a negotiated commercial license with ADSBexchange, or (c) a local receiver (explicitly out of scope in PROJECT.md — flag this as a v2 constraint).
- Abstract the feed behind an `AdsBProvider` interface from day one. The rest of the app knows only about `Position` and `Target`, not about which feed supplied them.
- Display attribution exactly as the chosen provider's ToS requires.
- Rate-limit at the app layer per the license agreement, not just per the provider's hard rate-limit, so bursty usage doesn't surprise-bill the account.
- Cache positions with a TTL appropriate to the license (some licenses prohibit persistent storage of position data beyond a short window).
- Do NOT ship the app pulling from OpenSky in production. OpenSky is fine for development against fixture data; production against it is a ToS violation once the app is commercial.

**Warning signs:**
- ADS-B feed URL hardcoded in a client-side API call (exposes the key AND bakes the feed in)
- No written contract / license agreement with the feed provider before beta
- Persisting every position to the DB indefinitely
- No attribution visible on the map UI

**Phase to address:** ADS-B phase — licensing decision gate **before any feed integration code is written**

---

### Pitfall 8: Treating ADS-B as a safety-of-flight source instead of situational awareness

**What goes wrong:**
The map shows traffic around the school's fleet. An instructor starts relying on it as a traffic-alerting tool: "I'll check the app before takeoff to see what's around." But network ADS-B feeds have:
- **Latency**: network-sourced positions can be 5–30+ seconds stale depending on feed and receiver proximity; feed itself is often 5-min delayed for free tiers
- **Coverage gaps at low altitude**: ADS-B reception is line-of-sight, and traffic below ~1,000 AGL is frequently invisible to the network
- **Anonymous targets**: some ADS-B targets broadcast anonymous ICAO addresses or are privacy-opted-out; they appear with no identity
- **Mode S non-ADS-B targets**: not shown at all
- **Non-transponder traffic** (gliders, ultralights, NORDO): completely invisible

If anyone treats the map as "traffic I can rely on," they will eventually miss a non-displayed aircraft.

**Consequences:**
A near-miss or worse, with the app cited as a contributing factor. Liability exposure to both the school and the software vendor.

**How to avoid:**
- Persistent disclaimer on every view of the map: "Situational awareness only. Not for collision avoidance. See-and-avoid remains the pilot's responsibility."
- Display the age of each target's last update prominently (color-code: green < 10s, yellow < 60s, red > 60s).
- Label anonymous/privacy targets explicitly as "Anonymous."
- Do not build features that look like alerting: no "conflict warning," no "proximity alert," no audible tones. Any such feature implies a safety claim the system cannot back.
- In the mobile app, do not allow the map to be the primary "in-flight" view. Label it "briefing / debrief tool."

**Warning signs:**
- Any UI element labeled "alert," "warning," "conflict," or "proximity"
- Missing "last update" age on targets
- Marketing copy describing the map as "traffic avoidance"

**Phase to address:** ADS-B phase — UX + legal language baked in at first render, not added later

---

### Pitfall 9: Multi-tenant data leakage via missing or bypassed Row-Level Security

**What goes wrong:**
PROJECT.md says "built so a second school could be onboarded later" with v1 single-tenant. The tempting path is to defer multi-tenancy — but the moment a second school onboards, any query that forgot a `WHERE school_id = ?` leaks data across tenants. Worse: a single admin user accidentally granted cross-school access sees PII, training records, and maintenance data from another school.

**Why it happens:**
Defer multi-tenancy → forget the tenant column on a late-added table → a query that JOINs it silently leaks. Or: RLS policies exist but a service role key is used in a backend path that bypasses RLS with no additional check.

**Consequences:**
Privacy incident. Student PII exposure. Possible FERPA-adjacent concerns if training is tied to veterans' benefits or a 141 accreditation later. Emergency re-audit of every query and every service-role code path.

**How to avoid:**
- Even in single-tenant v1, put `school_id` on every row that could ever be tenant-scoped (students, aircraft, bookings, maintenance, training records, endorsements). Default it to the single school's ID.
- Use Postgres Row-Level Security policies from day one. Seed with a single tenant; expand later.
- Any backend code path that uses a service-role / admin key must pass the tenant ID explicitly and assert it against the requested resource. "Service role" is not a license to skip the check.
- Integration tests include a "tenant isolation" suite: create two tenants with identical data, assert that user A sees zero rows belonging to tenant B across every endpoint.
- Avoid shared "global" tables that mix tenant data (e.g., a global `events` audit log without `school_id`).

**Warning signs:**
- Tables without `school_id` or `tenant_id`
- Service-role Postgres connections used outside of a tight, audited wrapper
- No cross-tenant isolation test in CI

**Phase to address:** Phase 1 (foundation / data model) — retrofitting RLS onto an existing schema is weeks of work and error-prone

---

### Pitfall 10: Mobile offline + OTA updates in a safety-adjacent context

**What goes wrong:**
Instructors expect to open the mobile app in the cockpit (no cell signal, spotty hangar WiFi) to review the next lesson, sign off a flight, log Hobbs. The app was built assuming connectivity. OR: an Expo OTA update pushes a broken build minutes before the first flight of the day, grounding instructors until they can downgrade.

**Why it happens:**
- Default React Native / Expo apps assume online-first
- Expo EAS Update is convenient and gets used without a staged rollout or blackout window
- No explicit offline queue for writes; a logged flight made offline just silently fails

**Consequences:**
- Offline failures: instructors start keeping paper notes again, trust in the system erodes, training records get reconstructed later (→ integrity issues, → pitfall 2)
- Broken OTA: fleet-wide operational outage during the morning flight window

**How to avoid:**
- Mobile app must explicitly define its offline surface: **read** access to today's schedule, assigned student's lesson plan, and aircraft status must work offline. **Write** operations (flight close-out, endorsement) must queue locally with a visible pending indicator, and sync when connectivity returns with conflict handling.
- Use a local-first data layer (SQLite via expo-sqlite, or WatermelonDB, or PowerSync-style sync). Do not rely on the HTTP layer alone.
- Offline writes must be deduplicated server-side using client-generated UUIDs — instructors will retry.
- EAS Update strategy: **never** push OTA updates during operational hours. Define a daily cutoff (e.g., no updates after 18:00 local school time, no updates at all on weekends). Staged rollouts (5% → 25% → 100%) with a 24-hour soak at each step.
- Every OTA channel has an automatic rollback trigger on crash-rate spike.
- Any write path that affects training records must work in airplane-mode end-to-end tests.

**Warning signs:**
- No SQLite / local DB in the mobile app
- `expo publish` / `eas update --channel production` runs outside a staged pipeline
- Endorsement or flight-close-out forms that show a loading spinner and fail on timeout

**Phase to address:** Mobile phase — offline-first must be a foundational decision, not a retrofit

---

### Pitfall 11: Scope creep into ForeFlight / Flight Schedule Pro territory

**What goes wrong:**
Partner school feedback generates requests: weather briefings, W&B calculations, e-logbook import, flight planning, runway analysis, fuel burn forecasting, billing, tuition, LMS integration, practice test banks. Each request sounds small. Six months later, the product is a worse version of ForeFlight + Flight Schedule Pro + King Schools + QuickBooks, with nothing done well.

**Why it happens:**
Single design-partner school is excited and generates broad requests. Every individual feature sounds reasonable. No explicit scope statement to bounce requests against.

**Consequences:**
V1 ships late, none of the four pillars (scheduling, maintenance, syllabus, ADS-B) are polished enough to unseat an incumbent. The product becomes unsellable to school #2 because each added feature was tailored to school #1's quirks.

**How to avoid:**
- The four pillars in PROJECT.md are the product. Every feature request gets classified: "pillar feature" (in scope) vs "adjacent" (out of scope, referred to an existing tool) vs "integration point" (build a webhook/export, not the feature itself).
- Explicit kill list in the roadmap: weather, W&B, flight planning, billing, LMS, e-tests — each with the sentence "We integrate/export; we don't build."
- Design-partner feedback goes into a backlog with a scope tag. Out-of-scope items are not "no," they are "not in v1."
- Measure v1 on whether the partner school **replaces** its current tools for the four pillars, not on feature count.

**Warning signs:**
- Backlog item that doesn't map to one of the four pillars and doesn't have an "integration" tag
- "Wouldn't it be cool if…" PRs
- Design-partner escalation about a feature that isn't in the pillars

**Phase to address:** Every phase — explicit scope gate at phase start and at every roadmap review

---

## Moderate Pitfalls

### Component lifing edge cases

Engine components have life limits (e.g., TBO recommendations, cylinder inspection intervals, prop 5/10-year overhauls, certain life-limited rotating parts). These lives transfer when a component moves between aircraft (e.g., a loaner engine). The system tracks components as nested under a tail number and has no concept of "component moved to a different airframe." **Prevention:** model components as independent entities with their own life ledgers, linked to an airframe via an install/remove history.

### §91.409 inspection cycle confusion (annual vs 100-hour)

Annual inspections (§91.409(a)) are calendar-based — due the last day of the 12th month after the prior annual. 100-hour inspections (§91.409(b)) are only required for aircraft flown for hire OR used for flight instruction in aircraft the school provides. A 100-hour may be exceeded by up to 10 hours **only** while en route to the place where the inspection is to be done, and that overrun is then subtracted from the next interval. The system's inspection-due calculator must model all of this. **Prevention:** encode the 10-hour overrun rule explicitly with a "overrun_used" field that reduces the next interval, and generate test fixtures for each §91.409 edge case.

### No-show vs cancellation vs weather scrub state machine

These three states look similar but have different downstream effects on billing, instructor utilization stats, and student reliability metrics. Collapsing them into one "canceled" state loses information forever. **Prevention:** model explicit states early; each has its own workflow and allowed transitions.

### Syllabus versioning

A student starts PPL training under syllabus v1.2. Halfway through, the school updates the template to v1.3 (reordered lessons, new stage check). What version is the student on? What do new students see? **Prevention:** students are pinned to a syllabus version at enrollment. Changes create a new version; existing students are never silently migrated. Any migration is an explicit admin action with a log entry.

### Clock skew in Hobbs/tach entries

Mechanic enters an oil-change Hobbs reading of 1250.3. A subsequent flight close-out shows Hobbs start 1249.8 (because an earlier flight's close-out was forgotten). The ledger is now non-monotonic. **Prevention:** reject non-monotonic entries with a "reconciliation" workflow that forces the user to identify the missing or incorrect prior entry.

### Instructor currency / endorsement expiry not surfaced

A CFI's Flight Instructor certificate expires every 24 calendar months (unless renewed). A medical expires. Recent flight experience (§61.57) expires. The system lets an expired CFI sign off a student. **Prevention:** instructor record stores cert expiration, medical class + expiration, and recent-experience computed state. Scheduling blocks assignment of an ineligible CFI with a clear reason.

---

## Minor Pitfalls

### Fuel and oil consumption tracked to the drop

Some schools want gallon-level fuel tracking per flight. It's finicky, low-value for the four pillars, and often wrong. **Prevention:** track at the work-order level (mechanic top-off), not per flight.

### Over-specific hardware assumptions

Assuming every aircraft has a G1000, or that every student has an iPad. Partner school may have a mixed fleet. **Prevention:** feature flags on avionics / device type; no hardcoded assumptions in core workflows.

### Logbook endorsement text drift from AC 61-65

The FAA's Advisory Circular 61-65 contains verbatim endorsement language that instructors are expected to use. If the template drifts from the current AC revision, instructors get flagged by DPEs. **Prevention:** endorsement text templates reference the AC revision they're based on; a quarterly check verifies against the current AC.

### PII handling for minors

Some student pilots are under 18. Data retention, parental consent, and export rules differ. **Prevention:** flag minor accounts and apply stricter defaults (no marketing, parent-linked account, explicit consent logging).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single `hours` column on aircraft | Fast schema, simple forms | Complete rewrite when mechanic and student start writing different clocks to it (pitfall 3) | **Never** |
| Hard delete on student/instructor records | Easy "delete" button | Destroys FAA-required records (pitfall 2) | **Never** |
| Free-text AD notes instead of structured AD entities | Ships maintenance "feature" in a weekend | False compliance signal, forced rewrite (pitfall 4) | **Never** |
| OpenSky in production | Free, no contract | ToS violation once commercial (pitfall 7) | Dev / fixtures only |
| Application-level double-booking check (no DB constraint) | Works fine in single-user testing | Silent double-booking under load (pitfall 6) | **Never** |
| Single "mechanic" role, no cert type | Simple RBAC | Unauthorized sign-offs (pitfall 5) | **Never** |
| Deferred multi-tenancy (no `school_id` column) | Less ceremony in v1 | Weeks of retrofit + data-leak risk (pitfall 9) | Acceptable only if documented as a Phase-2 gate that blocks second-tenant onboarding |
| Online-only mobile app | Ships faster | Instructor adoption collapses when offline breaks (pitfall 10) | Web-only MVP is OK; mobile MVP is not |
| Using `timestamp` without time zone | Slightly simpler | Timezone bugs, DST bugs, scheduling errors (pitfall 6) | **Never** |
| Deleting old bookings to "clean up" | DB housekeeping | Loses no-show / scrub history, invalidates stats | Archive, never delete |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenSky Network | Using in production for a commercial app | Dev/fixtures only; commercial license required for production, and OpenSky explicitly non-commercial |
| ADSBexchange | Using the RapidAPI "personal use" tier for a paid SaaS | Negotiate a commercial data license directly; use Enterprise API |
| FlightAware AeroAPI | Ignoring per-query billing — a chatty frontend drains the budget overnight | Proxy through backend with caching; rate-limit at app layer; fixed position-update cadence |
| Postgres tstzrange exclusion constraints | Writing overlap detection in application code and expecting it to hold under concurrency | Use `EXCLUDE USING gist` with `tstzrange` — the only correct place for this check |
| Expo EAS Update | Pushing updates during operational hours, no staged rollout | Off-hours windows, staged rollout, auto-rollback on crash-rate |
| Auth provider (Supabase Auth / Clerk / Auth.js) | Using service-role keys broadly in backend code, bypassing RLS | Service-role usage gated to a single audited module; explicit `school_id` assertion at every call |
| SendGrid / email for endorsements | Emailing the endorsement as the record itself | Email is a notification; the signed endorsement lives in the append-only DB + PDF export |
| PDF generation (for student files / work orders) | Generating PDFs with dynamic DB lookups at render time, so "historical" PDFs change when data changes | Snapshot the rendered PDF at sign-off; store the PDF bytes as an immutable artifact |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling the ADS-B feed from the client, one request per user | Rapidly hits provider rate limit; each map viewer costs an API call | Backend poll + WebSocket/SSE fan-out to clients; single authoritative position cache | As soon as 3–5 users open the map at once |
| Loading full training history for every student list render | Seconds-long list load | Paginate + summary view; lazy-load detail | ~50 students |
| Recomputing maintenance compliance per request | Slow dashboard, stale feeling | Event-driven compliance recomputation on relevant writes; cache per aircraft | ~20 aircraft |
| Storing every ADS-B position forever | DB bloat, license violation | TTL buckets: full resolution for N minutes, downsampled for N hours, deleted after license-allowed window | ~weeks of operation |
| N+1 queries on booking list (each booking loads aircraft + instructor + student separately) | List loads feel slow, DB shows thousands of tiny queries | Eager-load with a single join query | ~100 bookings |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Training records editable without audit trail | Fabricated endorsements, liability | Append-only; all edits are new rows |
| Role changes without audit log | Privilege escalation invisible | Every role change logged with who/when/why |
| Mechanic sign-off endpoint without cert-authority check | Unauthorized return-to-service (pitfall 5) | Server-side authority check, never client-trusted |
| ADS-B API key in client bundle | Key theft, billing fraud | Backend proxy only; client never sees feed credentials |
| Student PII in URLs or logs | FERPA-adjacent exposure, leak via log aggregation | No PII in URLs; log redaction for student names / cert numbers |
| Public read endpoint for aircraft tail numbers + location | Enables targeted theft / stalking | Aircraft positions are tenant-scoped; no public endpoint |
| Password reset emails containing session tokens with long lifetimes | Account takeover via email breach | Short-lived reset tokens, one-time use |
| Admin impersonation without audit | Admin can't be traced when viewing a student's records | "View as" is logged as an impersonation event with reason |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Booking flow that doesn't show aircraft maintenance status | Student books a grounded plane, shows up, frustrated | Booking UI shows live MX status ("OK," "Due in X hrs," "Grounded") and blocks grounded aircraft at the DB level |
| Instructor's "today" view requires 4 taps | Instructors revert to paper in the cockpit | One-tap "Today" that works offline, shows all flights + student + lesson |
| No diff view when a syllabus updates | Students / instructors confused about what changed | Show "since last login" changelog for their syllabus version |
| Silent failure on offline write | Instructor thinks sign-off saved, it didn't (→ pitfall 2) | Persistent pending indicator with retry + explicit "synced" confirmation |
| Endorsement UI that doesn't show the verbatim AC 61-65 text | Instructor hand-edits the text, drifts from FAA language | Lock the AC text; only variable fields are editable |
| Map with no "last update" timestamp on targets | User trusts stale positions (→ pitfall 8) | Per-target age indicator, global feed-health indicator |
| "Complete" work order button that doesn't require sign-off | Work orders closed without signature | No "complete" without valid sign-off; explicit two-step |
| Timezone shown as "10:00" with no TZ label when student and school are in different zones | Missed flights | Always show TZ abbreviation on any time display that crosses zones |

---

## "Looks Done But Isn't" Checklist

- [ ] **Training records:** Verify you can export a single student's complete training file as a PDF that an FSDO inspector would accept, including all endorsements with verbatim AC 61-65 language and the signing CFI's cert number.
- [ ] **Maintenance compliance:** Verify the "compliance dashboard" lists which ADs it considered and refuses to show "green" when zero ADs are on file for the tail.
- [ ] **Scheduling:** Verify double-booking is impossible at the DB layer under concurrent requests — run a load test that fires 50 simultaneous bookings for the same slot and expect exactly 1 success.
- [ ] **Scheduling:** Verify the instructor-aircraft-student triple is checked as a composite constraint, not just aircraft.
- [ ] **Hobbs/tach:** Verify an aircraft can be configured with independent Hobbs and tach clocks and that the 100-hour inspection tracker uses the correct clock.
- [ ] **Mechanic sign-off:** Verify a user with a "mechanic" role but no IA authority cannot sign off an annual inspection.
- [ ] **Multi-tenant:** Verify, with two seeded tenants, that tenant A cannot see any row from tenant B across every list/detail endpoint.
- [ ] **ADS-B:** Verify a written commercial license with the feed provider exists before beta, and that the app shows required attribution.
- [ ] **ADS-B:** Verify the disclaimer is visible on every map view, not just the initial onboarding.
- [ ] **Mobile offline:** Verify in airplane mode an instructor can open today's schedule, open the student's lesson plan, and log a flight close-out that queues locally and syncs on reconnect.
- [ ] **Training records immutability:** Verify that deleting a student from the admin UI does not remove their historical endorsements and that an inspector export still produces them.
- [ ] **Timezone:** Verify scheduling works correctly for an Arizona (no DST) school with a traveling student on PDT.
- [ ] **Syllabus versioning:** Verify a student enrolled on syllabus v1.2 still sees v1.2 after the template is updated to v1.3.
- [ ] **Instructor currency:** Verify a CFI with an expired flight instructor certificate cannot be scheduled with a student.
- [ ] **Work-order audit:** Verify a completed work order cannot be silently edited; edits create a new signed revision.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| "Part 141" language leaked into UI / PDFs | LOW | Grep + rewrite strings, regenerate PDF templates, notify users if exports were sent |
| Training records using hard delete | HIGH | Restore from backup, migrate to append-only schema, audit every deleted record, notify school |
| Hobbs/tach conflated into one column | HIGH | Schema migration, manual data reconciliation with mechanic, ground fleet until cleared |
| AD tracking as free-text | HIGH | Build structured AD entity, manually re-enter every AD per tail with IA review, re-verify compliance before clearing aircraft |
| Unauthorized mechanic sign-off discovered | HIGH | Ground affected aircraft, re-inspect with authorized mechanic, update schema with cert-authority checks, report to FSDO if required |
| Double-booking discovered in production | MEDIUM | Add DB exclusion constraint immediately; script to detect historical overlaps and notify affected users |
| ADS-B ToS violation / API key revoked | MEDIUM | Switch to a licensed provider behind the abstraction layer; negotiate retroactive commercial terms if possible |
| ADS-B misused as safety tool | MEDIUM | Add disclaimers, remove alert-like UI, publish usage guidance, retrain users |
| Tenant data leak | HIGH | Emergency rotate credentials, audit query logs for cross-tenant reads, notify affected tenants, add RLS + isolation tests |
| Mobile OTA broke the fleet | MEDIUM | Rollback via EAS channel; establish staged rollout; post-mortem |
| Scope crept into ForeFlight-lite | MEDIUM | Explicit scope reset; deprecate out-of-scope features; refocus on the four pillars |

---

## Pitfall-to-Phase Mapping

Phase names are suggestive — the roadmap creator may rename but the ordering implications stand.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. "Part 141" language | Phase 1 (foundation / terminology) | CI grep for banned strings; CFI review of all templates before beta |
| 2. Training records non-compliant | Training-records phase (must be early, before syllabus) | End-to-end test: create student, endorse, delete user, verify export still produces record |
| 3. Hobbs/tach math | Maintenance phase (data model gate) | Test fixtures covering independent Hobbs/tach drift |
| 4. AD tracking as free-text | Maintenance phase (alongside inspection engine) | Compliance dashboard refuses "green" with zero ADs on file |
| 5. Unqualified sign-off | Maintenance phase (RBAC gate before work orders) | Test: mechanic without IA cannot complete an annual |
| 6. Double-booking / timezone | Scheduling phase (DB constraint gate) | Load test: 50 concurrent bookings → exactly 1 success; Arizona+PDT fixture |
| 7. ADS-B ToS | ADS-B phase (licensing gate, before any feed code) | Signed commercial license artifact in repo; attribution visible on map |
| 8. ADS-B as safety tool | ADS-B phase (UX review) | Every map view shows disclaimer; no "alert" UI |
| 9. Multi-tenant leak | Phase 1 (foundation / data model) | Tenant isolation test in CI |
| 10. Mobile offline + OTA | Mobile phase (offline-first design gate) | Airplane-mode E2E test; staged EAS rollout configured |
| 11. Scope creep | Every phase | Phase-start scope gate; backlog items tagged pillar vs integration vs out-of-scope |

---

## Sources

- **14 CFR §61.189** (Flight instructor records — 3-year retention): https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61/subpart-H/section-61.189 — HIGH
- **14 CFR §61.51** (Pilot logbook requirements): https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61/subpart-A/section-61.51 — HIGH
- **14 CFR Part 61** (general): https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61 — HIGH
- **14 CFR §91.409** (inspections — annual/100-hour): referenced from eCFR Part 91 — HIGH (regulatory text is authoritative; 10-hour overrun rule is a well-known specific provision)
- **14 CFR Part 43** (maintenance — return to service authority): authoritative source for A&P/IA sign-off requirements — HIGH
- **FAA AC 61-65** (endorsement language reference): FAA advisory circular, current revision should be referenced in implementation — HIGH
- **ADS-B Exchange Terms of Use** (no bulk resale/redistribution; commercial use requires written agreement): https://www.adsbexchange.com/terms-of-use/ — HIGH
- **ADS-B Exchange Enterprise API** (commercial licensing path): https://www.adsbexchange.com/products/enterprise-api/ — HIGH
- **ADS-B Exchange API-Lite (RapidAPI personal-use tier)**: https://www.adsbexchange.com/api-lite/ — HIGH
- **OpenSky Network** (non-commercial research use): https://opensky-network.org/ — HIGH for the non-commercial default; commercial terms require direct negotiation
- **FlightAware AeroAPI** terms — MEDIUM; specific re-display and storage rights depend on contract tier and should be confirmed directly with FlightAware before integration
- **PostgreSQL `EXCLUDE USING gist` with `tstzrange`** for non-overlap constraints — standard Postgres feature, HIGH
- **Community / forum observations** on §61.189 record-keeping practice: https://www.pilotsofamerica.com/community/threads/far-61-189-flight-instructor-records.49911/ — LOW (supporting color only; regulatory text is authoritative)
- **Aviation Instructor's Handbook (FAA-H-8083-9)** Appendix C: https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/aviation_instructors_handbook/15_aih_appendix_c.pdf — HIGH

**Gaps / follow-up needed during roadmap execution:**
- Confirm current revision of AC 61-65 before shipping endorsement templates
- Obtain written terms / pricing from chosen ADS-B provider before ADS-B phase begins
- Have the design-partner school's chief instructor review the terminology contract and all template syllabi
- Validate the §91.409 10-hour overrun implementation against a current IA's reading of the rule

---
*Pitfalls research for: Flight school operations platform (Part 61 School)*
*Researched: 2026-04-06*
