# Part 61 School

## What This Is

A flight school operations platform that lets an FAA Part 61 school run with the structure and rigor of a Part 141 school — without the FAA paperwork burden of actually being 141. It unifies aircraft maintenance tracking, syllabus + training records, student-driven aircraft scheduling, and real-time fleet visibility (ADS-B) into one role-based application for students, instructors, mechanics, and admins.

## Core Value

Give a Part 61 school a single source of truth for fleet, training, and scheduling so it can operate as professionally as a 141 school. All four pillars — scheduling, maintenance/downtime prediction, syllabus tracking, and ADS-B fleet visibility — must work cohesively, but none individually need to be flawless in v1.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Aircraft scheduling: students request, instructors/admins approve, no double-booking, scheduling respects maintenance status
- [ ] Full CAMP-style maintenance tracking: Hobbs/tach logging, 100hr/annual/AD compliance, component lifing, parts inventory, work orders, mechanic sign-off, digital logbooks
- [ ] Maintenance downtime prediction based on historical data + upcoming inspections
- [ ] Syllabus tracking with both a Part 141-style template (PPL/IR/Comm stage checks and lessons) and custom syllabus support
- [ ] Student lesson progress, training records, and stage check tracking that mirrors 141 record-keeping standards
- [ ] Real-time ADS-B fleet map showing school aircraft + surrounding traffic, sourced from a network feed (OpenSky / ADSBexchange / FlightAware)
- [ ] Role-based access: student, instructor, mechanic, admin — unified app, role-gated UI
- [ ] Admin section: CRUD students, CRUD aircraft, assign and change roles
- [ ] Web app (Next.js) + native mobile (React Native / Expo) sharing one backend
- [ ] Authentication and per-school data isolation (built so a second school could be onboarded later)

### Out of Scope

- Actual FAA Part 141 certification workflow / DPE integration — we mirror the structure, we don't certify
- Local ADS-B receiver ingestion (dump1090/PiAware) — v1 uses a network feed only
- Billing / Stripe / student tuition payments — defer to v2
- Weather briefing / flight planning / W&B calculations — defer to v2 (use existing tools like ForeFlight)
- Mechanic hours/labor billing — out of scope, only sign-off is tracked

## Context

- Owner is approaching a local Part 61 school as design partner; this baseline is what the owner *thinks* they need, and the partner school will refine it
- Multi-tenant capable architecture is desirable so other Part 61 schools can adopt later, but v1 ships single-tenant for the partner school
- Owner has an existing ADS-B program/interest — comfortable with that domain
- Repo: https://github.com/Think-Forward-Studios/Part-61-School
- Project must look and feel professional enough that a 141-trained instructor recognizes the structure

## Constraints

- **Tech stack**: Next.js (web) + React Native/Expo (mobile) + Postgres — chosen for shared TypeScript across web/mobile and strong relational modeling for maintenance/syllabus data
- **Compliance**: Training records and maintenance logs must be exportable in formats acceptable for FAA inspection of a Part 61 school's records
- **Real-time**: ADS-B map must update at a rate that feels live (target ~5s)
- **Data integrity**: Scheduling and maintenance data are safety-relevant — no silent failures, audit trail required

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + React Native + Postgres | Shared TS code, strong relational fit for maintenance/syllabus, owner preference | — Pending |
| Network ADS-B feed (not local receiver) for v1 | Simpler ingestion, no hardware dependency for partner school | — Pending |
| Unified app with role-gated UI | One codebase, simpler ops, students/instructors/mechanics see different views | — Pending |
| Full CAMP-style maintenance (not just alerting) | Owner wants real maintenance system, not a reminder app | — Pending |
| Both 141-style template syllabus AND custom | Gives partner school a starting point but flexibility | — Pending |
| Multi-tenant ready architecture, single-tenant deploy in v1 | Future-proofs for SaaS expansion without v1 overhead | — Pending |

---
*Last updated: 2026-04-06 after initialization*
