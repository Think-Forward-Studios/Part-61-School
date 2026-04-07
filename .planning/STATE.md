# STATE: Part 61 School

**Last updated:** 2026-04-06 (post-revision)

## Project Reference

**Core Value:** Give a Part 61 school a single source of truth for fleet, training, and scheduling so it can operate as professionally as a 141 school.

**Current Focus:** Awaiting Phase 1 planning.

## Current Position

- **Phase:** — (not started)
- **Plan:** —
- **Status:** Roadmap revised (8 phases, 136 reqs), ready for `/gsd:plan-phase 1`
- **Progress:** 0/8 phases complete `[········]`

## Performance Metrics

- Phases complete: 0/8
- Plans complete: 0/0
- v1 requirements mapped: 136/136

## Accumulated Context

### Key Decisions
- Build order: Foundation → Personnel+Fleet → Scheduling+Dispatch → CAMP → Syllabus Model → Syllabus Rules/Progression → ADS-B → Experience/Reporting/Beta
- ADS-B is integration with existing service at `/Users/christopher/Desktop/ADS-B Data` (REST at port 3002), not a rebuild
- Web-only for v1; mobile deferred to v2
- Multi-tenant RLS from day 1; single-tenant deploy; multi-base scoping from Phase 2
- `isAirworthyAt()` domain contract stubbed in Phase 3, replaced for real in Phase 4
- Syllabus split into two phases: P5 builds the Course→Stage→Phase→Unit→Lesson→LineItem model, grading, records, and exports; P6 adds the active progression engine (rollover, rules, prerequisites, projections, nightly audit, next-activity suggestion)
- Personnel (PER) and instructor currencies/quals (IPF-01/02) land in Phase 2 so scheduling and dispatch can depend on them
- Flight Tracking & Dispatch (FTR) folded into Phase 3 alongside scheduling — dispatch IS scheduling execution
- Audit log and cost tracking (REP) consolidated in Phase 8 on top of the audit scaffolding from Phase 1
- Messaging (MSG) and multi-base reporting (MUL-03) are Phase 8 cross-cutting polish

### Revision History
- 2026-04-06: Initial 7-phase roadmap created (75 requirements)
- 2026-04-06: Revised to 8 phases (75 → 136 requirements). Added personnel management, instructor performance, dispatch execution, audit/reporting, messaging, and multi-location categories. Split syllabus into model (P5) and progression engine (P6).

### Open Todos
- (none until planning begins)

### Blockers
- (none)

## Session Continuity

**Next action:** Run `/gsd:plan-phase 1` to plan Foundation & Terminology Contract.

**Files:**
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/research/` (SUMMARY, STACK, FEATURES, ARCHITECTURE, PITFALLS)

---
*State initialized: 2026-04-06*
*Revised: 2026-04-06 (post-expansion)*
