---
phase: 04-camp-maintenance
plan: 04
subsystem: camp-admin-ui
tags: [next-app-router, trpc-client, camp, ui, ceremony, mel]
requires:
  - 04-03 tRPC routers (admin.maintenance, squawks, workOrders, ads,
    parts, overruns, components, maintenanceTemplates)
  - Phase 3 dispatch board + reservation status label helpers
  - packages/domain/src/schemas/maintenanceKindLabels.ts
provides:
  - /admin/maintenance cross-fleet dashboard (MNT-01/02/03/11)
  - /admin/aircraft/[id]/maintenance per-aircraft tab (items + ADs + components)
  - /admin/aircraft/[id] MaintenancePanel drop-in with §91.409 overrun CTA
  - /admin/ads catalog + detail + applyToFleet action
  - /admin/squawks fleet board + 5-state lifecycle detail page
  - /admin/work-orders list + detail with tasks, parts, ceremonial sign-off
  - /admin/parts list + detail with lots + consumption history
  - /admin/maintenance-templates manager list
  - dispatch MEL badge component + wiring
affects:
  - apps/web/app/(app)/admin/aircraft/[id]/page.tsx (MaintenancePanel drop-in)
  - apps/web/app/(app)/dispatch/DispatchBoard.tsx (MEL badge wiring)
tech_added: []
patterns:
  - 'Server Components fetch via direct drizzle db + sql template; client
    islands use trpc React hooks for mutations.'
  - 'Ceremonial sign-off buttons: red border, bold red background, explicit
    I-certify checkbox, legal-binding warning.'
  - '§91.409(b) overrun modal: orange warning banner, IA-cert snapshot copy,
    dual gate (UI hide on non-IA users + server-side buildSignerSnapshot).'
  - 'MEL badge reads admin.squawks.list once per board, filters client-side
    by aircraftId — single query, cached 60s.'
  - 'Status chips mapped consistently: green=current, yellow=due_soon/MEL,
    red=overdue, dark-red=grounding, orange=overrun.'
key_files:
  created:
    - apps/web/app/(app)/admin/maintenance/page.tsx
    - apps/web/app/(app)/admin/aircraft/[id]/MaintenancePanel.tsx
    - apps/web/app/(app)/admin/aircraft/[id]/maintenance/page.tsx
    - apps/web/app/(app)/admin/aircraft/[id]/maintenance/CompleteMaintenanceButton.tsx
    - apps/web/app/(app)/admin/ads/page.tsx
    - apps/web/app/(app)/admin/ads/ApplyAdToFleetButton.tsx
    - apps/web/app/(app)/admin/ads/[id]/page.tsx
    - apps/web/app/(app)/admin/maintenance-templates/page.tsx
    - apps/web/app/(app)/admin/squawks/page.tsx
    - apps/web/app/(app)/admin/squawks/[id]/page.tsx
    - apps/web/app/(app)/admin/squawks/[id]/SquawkActions.tsx
    - apps/web/app/(app)/admin/work-orders/page.tsx
    - apps/web/app/(app)/admin/work-orders/[id]/page.tsx
    - apps/web/app/(app)/admin/work-orders/[id]/WorkOrderTasks.tsx
    - apps/web/app/(app)/admin/work-orders/[id]/SignOffCeremony.tsx
    - apps/web/app/(app)/admin/parts/page.tsx
    - apps/web/app/(app)/admin/parts/[id]/page.tsx
    - apps/web/app/(app)/admin/parts/[id]/ReceiveLotForm.tsx
    - apps/web/app/(app)/dispatch/_components/MelBadge.tsx
  modified:
    - apps/web/app/(app)/admin/aircraft/[id]/page.tsx
    - apps/web/app/(app)/dispatch/DispatchBoard.tsx
decisions:
  - 'No server-side trpcServer caller (lib/trpc/server.ts absent) — the
    established admin pattern from Phases 2-3 is direct `db` + `sql` in
    server components. New CAMP pages follow suit. Client islands (panels,
    modals, action bars) use `trpc` react hooks.'
  - 'Complete maintenance modal is intentionally minimal (just completedAt
    datetime) — optional lastCompletedHours jsonb builder deferred since the
    router accepts it but a full hours-builder is a v2 UX improvement.'
  - 'MelBadge reuses admin.squawks.list (unresolvedAt-filtered, protected
    procedure) instead of adding a new filtered procedure — avoids router
    changes in a pure-UI plan and keeps one query per dispatch refresh.'
  - 'SquawkActions hides buttons the caller cannot use based on a
    user_roles mechanic_authority lookup in the server component, but the
    router still enforces via buildSignerSnapshot — defense in depth.'
  - 'SignOffCeremony computes highestRequired from task.required_authority
    rows in the server component and compares against caller authority to
    decide whether the big red button is enabled — matches the router''s
    highestAuthority helper but the server call is still the source of truth.'
  - 'Banned-term lint: every user-facing string uses "compliant" / "certify"
    / "authorized" / "current" — no "approved" literal appears in any new
    .tsx file. reservationStatusLabel() continues to handle the internal
    enum-to-label translation for dispatch.'
metrics:
  duration: 10m
  tasks: 2
  files: 21
  tests_added: 0
  completed: 2026-04-09
---

# Phase 4 Plan 04: CAMP Admin UI Summary

Delivers the full admin-facing UI for Phase 4 CAMP: cross-fleet
maintenance dashboard, per-aircraft maintenance panel with the §91.409(b)
overrun ceremony, AD catalog, squawk lifecycle board, work-order
ceremonial sign-off, parts inventory, maintenance templates, and the
dispatch MEL badge — 19 new files + 2 modified, all against the Wave 3
tRPC surface with zero schema/router changes.

## What Shipped

### Maintenance dashboard + panel + detail

- `/admin/maintenance` — fleet-wide dashboard grouped by aircraft,
  showing every item in `due_soon` / `overdue` / `grounding`. Sorted by
  (status severity, next_due_at). Status chips use the agreed palette:
  green=current, yellow=due_soon, red=overdue, dark-red=grounding.
- `MaintenancePanel.tsx` — drops into the aircraft detail page next to
  EnginesPanel / EquipmentPanel / RecentFlightsPanel. Shows:
  - Red grounded banner (if `aircraft.grounded_at is not null`)
  - Orange active-overrun countdown (if an unexpired row exists in
    `maintenance_overrun`)
  - Summary counts (current / due_soon / overdue / grounding)
  - IA-only "Request §91.409 overrun" CTA — only renders when the
    current user has mechanic_authority='ia' AND the grounded_by item is
    a `hundred_hour_inspection`
  - OverrunModal with orange border, "THIS OVERRIDES THE AIRWORTHINESS
    GATE" warning, min-20-char justification, 1-10 max-hours input.
- `/admin/aircraft/[id]/maintenance` — three sections (items, AD
  compliance, components) with inline `CompleteMaintenanceButton` modal.

### AD catalog

- `/admin/ads` list + `ApplyAdToFleetButton` client component that
  calls `admin.ads.applyToFleet` and displays the new-compliance-rows
  count inline.
- `/admin/ads/[id]` detail with summary (pre-wrap) and a per-aircraft
  compliance grid sourced from drizzle directly.

### Squawk lifecycle

- `/admin/squawks` with status chip filter (active / open / triaged /
  deferred / in_work / fixed / all). Default is "active" (everything
  except returned_to_service/cancelled).
- `/admin/squawks/[id]` with full timeline + `SquawkActions` client
  component implementing the 5-state machine:

  | From state | Transition              | Button                          |
  | ---------- | ----------------------- | ------------------------------- |
  | open       | → triaged (defer / WO)  | Triage (modal)                  |
  | triaged    | → in_work               | Start work                      |
  | deferred   | → in_work               | Start work                      |
  | in_work    | → fixed                 | Mark fixed                      |
  | fixed      | → returned_to_service   | **Sign and Return to Service**  |
  | any        | → cancelled             | Cancel (prompt reason)          |

  The "Sign and Return to Service" button has red border, ceremonial
  styling, "THIS IS LEGALLY BINDING" language, and explicit confirm.

### Work orders

- `/admin/work-orders` list with status filter (all / open /
  in_progress / pending_signoff / closed).
- `/admin/work-orders/[id]` detail with:
  1. Header (title, kind, aircraft, status)
  2. `WorkOrderTasks` client component — add task, per-task
     required_authority chip (A&P or IA), per-task Mark Complete
     button that calls `admin.workOrders.completeTask`
  3. Parts consumed table sourced from drizzle
  4. `SignOffCeremony` — disabled until every task is complete AND the
     caller meets the highest required authority across tasks. When
     enabled, renders the big red "SIGN AND RETURN TO SERVICE" button;
     opens a modal with legal-binding warning, sealed-logbook
     description textarea, explicit "I certify" checkbox, and calls
     `admin.workOrders.signOff`.

### Parts inventory

- `/admin/parts` list with low-stock highlight (red/bold when
  on_hand_qty <= min_reorder_qty).
- `/admin/parts/[id]` with lots table and consumption history joined to
  work_order titles. `ReceiveLotForm` client component for adding new
  lots.

### Maintenance templates

- `/admin/maintenance-templates` list separating system (unscoped) from
  school-scoped templates with line-count column. Application to a
  specific aircraft is deferred to the aircraft-detail flow.

### Dispatch MEL badge

- `dispatch/_components/MelBadge.tsx` — yellow pill component keyed on
  `aircraftId`. Queries `admin.squawks.list` once (staleTime 60s) and
  filters client-side for status='deferred' on that aircraft. Tooltip
  lists titles. Wired into `DispatchBoard.tsx` inside the RowCard next
  to the activity name.
- Does NOT block dispatch — reminder only, per CONTEXT.

## Verification

| Gate                                                      | Result                    |
| --------------------------------------------------------- | ------------------------- |
| `pnpm --filter ./apps/web typecheck`                      | green                     |
| `pnpm -r typecheck`                                       | green (6 workspaces)      |
| `pnpm --filter ./apps/web lint` (incl. no-banned-terms)   | green                     |
| `pnpm -r lint`                                            | green                     |
| `pnpm --filter ./apps/web build`                          | **45 routes, green**      |

Route count went from ~35 (Phase 3 end) to **45** — matches the expected
Phase 4 additions: `/admin/maintenance`, `/admin/maintenance-templates`,
`/admin/ads`, `/admin/ads/[id]`, `/admin/squawks`, `/admin/squawks/[id]`,
`/admin/work-orders`, `/admin/work-orders/[id]`, `/admin/parts`,
`/admin/parts/[id]`, `/admin/aircraft/[id]/maintenance` = 11 new admin
routes.

## Deviations from Plan

None — Rules 1-3 were not needed. The plan called out the `lib/trpc/server.ts`
expectation but the working codebase actually uses direct `db` access from
server components (Phase 2-3 pattern). Followed the existing pattern instead
of introducing `trpcServer`, matching `admin/aircraft/page.tsx` and
`admin/fif/page.tsx`. Recorded as a Decisions note above, not a deviation
(no rework needed).

The Complete-maintenance modal is intentionally minimal (datetime only);
the router accepts `completedAtHours` jsonb and `workOrderId` but a rich
builder is out-of-scope polish.

## Commits

- `ff6c117` — feat(04-04): maintenance dashboard + panel + ADs + templates UI (Task 1)
- `4f652d0` — feat(04-04): squawks + work orders + parts UI + dispatch MEL badge (Task 2)

## Requirements closed

- **MNT-01** cross-fleet maintenance visibility
- **MNT-03** auto-ground surfacing + §91.409 overrun request UI (IA gate)
- **MNT-04** squawk lifecycle UI (5-state machine)
- **MNT-05** ceremonial return-to-service
- **MNT-11** downtime surfacing on aircraft profile (summary counts +
  active overrun banner)

## Self-Check

All 19 created files exist on disk. Both commit hashes resolve in
`git log --oneline`. Typecheck, lint, and build all green across the
entire monorepo. Banned-term rule clean on every new `.tsx` file.

## Self-Check: PASSED
