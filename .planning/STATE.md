---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: 'Phase 1 in progress — plan 01-01 (foundation bootstrap) complete'
last_updated: '2026-04-07T02:37:01.500Z'
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
  percent: 25
---

# STATE: Part 61 School

**Last updated:** 2026-04-07 (post 01-01 execution)

## Project Reference

**Core Value:** Give a Part 61 school a single source of truth for fleet, training, and scheduling so it can operate as professionally as a 141 school.

**Current Focus:** Phase 1 — foundation chassis (RLS, audit, banned-term contract).

## Current Position

- **Phase:** 01-foundation-terminology-contract
- **Plan:** 01-02 (next)
- **Status:** Plan 01-01 complete (monorepo + banned-term rule + CI)
- **Progress:** Phase 1 [███░░░░░░░] 25% (1/4 plans) · Project 0/8 phases

## Performance Metrics

- Phases complete: 0/8
- Plans complete: 1 (01-01)
- v1 requirements mapped: 136/136

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 01    | 01   | ~6m      | 3     | 33    |

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

### Decisions (01-01)

- ESLint flat config files use `.mjs` extension so the config package can stay CommonJS for Prettier/index entries
- Custom `part61/no-banned-terms` rule lives in-repo as a CommonJS file consumed via in-config plugin object — no separate plugin package
- Allow-comment lookup walks parent statements so `// allow-banned-term: <reason>` above a `const x = 'Part 141'` works
- CI pipeline shape locked: install → typecheck → lint → test → build; Supabase steps stubbed as YAML comment for plan 02 to insert

### Revision History

- 2026-04-06: Initial 7-phase roadmap created (75 requirements)
- 2026-04-06: Revised to 8 phases (75 → 136 requirements). Added personnel management, instructor performance, dispatch execution, audit/reporting, messaging, and multi-location categories. Split syllabus into model (P5) and progression engine (P6).

### Open Todos

- (none until planning begins)

### Blockers

- (none)

## Session Continuity

**Next action:** Execute plan 01-02 of Phase 1.

**Last session stopped at:** Completed 01-01-PLAN.md (commits a6dda65, 7513ba6, e0ef104).

**Files:**

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/research/` (SUMMARY, STACK, FEATURES, ARCHITECTURE, PITFALLS)

---

_State initialized: 2026-04-06_
_Revised: 2026-04-06 (post-expansion)_
