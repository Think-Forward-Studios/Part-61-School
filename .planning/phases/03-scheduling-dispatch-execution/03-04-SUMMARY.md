---
phase: 03-scheduling-dispatch-execution
plan: 04
subsystem: dispatch-ui
tags: [dispatch, scheduling, polling, react, banned-terms, phase3]
one_liner: "Live dispatch board with 15s polling, multi-gate dispatch modal (check-in + authorize + FIF + Hobbs + manifest), close-out form with squawks and instructor sign-off, print-friendly passenger manifest"

requires:
  - phase: 03-scheduling-dispatch-execution plan 02
    provides: tRPC dispatch.list / markStudentPresent / authorizeRelease / dispatchReservation / closeOut / passengerManifestUpsert and fif.listUnacked / acknowledge
  - phase: 03-scheduling-dispatch-execution plan 03
    provides: reservationStatusLabel + RES_STATUS centralized labels (banned-term sidestep)
provides:
  - "/dispatch live board (3 panels, 15s poll, refetchIntervalInBackground=false)"
  - "DispatchModal with student-present + authorize + FIF + Hobbs/tach + manifest gates"
  - "OverdueAlarm using sessionStorage seen-set + AudioContext priming button"
  - "/dispatch/close/[id] CloseOutForm with dynamic squawks (useFieldArray) and instructor sign-off"
  - "/dispatch/manifest/[id] print-friendly passenger manifest"
  - "StudentCheckInButton component for student schedule cards (15min window)"
affects:
  - Phase 5 (Grade lesson placeholder)
  - Phase 8 (Supabase Realtime / nightly no-show sweep)

tech-stack:
  added: []
  patterns:
    - TanStack Query refetchInterval=15000 with refetchIntervalInBackground=false to auto-pause on hidden tab
    - sessionStorage diff for one-shot audio cue per new overdue id
    - HTMLAudioElement priming via user gesture to satisfy autoplay policy
    - react-hook-form + useFieldArray WITHOUT zodResolver (mirrors Wave 3)
    - Server Component page shells with 'use client' interactive islands
    - Banned-term avoidance via reservationStatusLabel from @part61/domain

key-files:
  created:
    - apps/web/app/(app)/dispatch/page.tsx
    - apps/web/app/(app)/dispatch/DispatchBoard.tsx
    - apps/web/app/(app)/dispatch/DispatchModal.tsx
    - apps/web/app/(app)/dispatch/FifGate.tsx
    - apps/web/app/(app)/dispatch/OverdueAlarm.tsx
    - apps/web/app/(app)/dispatch/PassengerManifestPanel.tsx
    - apps/web/app/(app)/dispatch/close/[id]/page.tsx
    - apps/web/app/(app)/dispatch/close/[id]/CloseOutForm.tsx
    - apps/web/app/(app)/dispatch/manifest/[id]/page.tsx
    - apps/web/app/(app)/dispatch/manifest/[id]/PrintButtonClient.tsx
    - apps/web/components/dispatch/StudentCheckInButton.tsx
    - apps/web/public/sounds/overdue.wav
  modified: []

key-decisions:
  - "Audio cue uses a generated 880Hz/0.25s WAV (4KB) instead of an MP3 — WAV plays in every browser without an encoder dependency, and the planner only required 'a short tone' as the artifact"
  - "OverdueAlarm requires a one-time 'Enable sound alerts' click to prime the HTMLAudioElement; subsequent overdue events can play without a fresh gesture"
  - "DispatchBoard tolerates either snake_case (raw SQL) or camelCase (Drizzle) field shapes for forward compat with future router refactors"
  - "Manifest print page is a Server Component with a single tiny PrintButtonClient client island — no client tree for the manifest body"
  - "CloseOutForm follows Wave 3 react-hook-form pattern (hand-written FormValues, no zodResolver) to avoid the 'two instances of Resolver' type clash"
  - "PIC/SIC seeded into manifest from instructor/student ids; dispatcher can rename and add additional passengers inline"

patterns-established:
  - "Polling dispatch screen: useQuery + refetchInterval=15000 + refetchIntervalInBackground=false"
  - "Audio gate: prime AudioContext on user click before relying on autoplay"
  - "Multi-gate modal: each gate's completion stored in component state, submit button enabled only when ALL gates pass"

requirements-completed:
  - SCH-08
  - SCH-09
  - INS-04
  - FTR-01
  - FTR-02
  - FTR-03
  - FTR-04
  - FTR-05
  - FTR-06
  - FTR-08

duration: 18min
completed: 2026-04-08
---

# Phase 3 Plan 04: Dispatch Execution UI Summary

The day-of-work hub is alive. `/dispatch` polls the tRPC dispatch.list query every 15 seconds and renders three panels (Currently Flying / About to Fly / Recently Closed), with red rows + a one-shot audio beep + dismissable banner the moment a flight slips past its end + 30 min grace. The dispatch modal walks a strict gate sequence — student check-in, instructor authorization, FIF acknowledgements, Hobbs/tach out, passenger manifest — and only enables the Dispatch button when every gate is satisfied. Close-out lives at `/dispatch/close/[id]` and writes a paired flight_log_entry + observed squawks (auto-grounding on severity=grounding) + instructor sign-off. Passenger manifest at `/dispatch/manifest/[id]` is a print-to-PDF-friendly HTML page.

## Performance

- **Duration:** 18 min
- **Tasks:** 2 (both autonomous)
- **Files created:** 12
- **Files modified:** 0

## Accomplishments

- **3-panel live board** (DispatchBoard) with 15s polling that pauses on tab hidden
- **OverdueAlarm** using sessionStorage seen-set so the beep fires exactly once per new overdue id even across re-renders
- **AudioContext priming button** to satisfy browser autoplay policy
- **DispatchModal** with five sequential gates (student check-in / instructor authorize / FIF acks / Hobbs+tach / manifest)
- **CloseOutForm** with dynamic squawk rows (react-hook-form useFieldArray), Save draft → pending_sign_off, Sign off & close → closed
- **Passenger manifest** print page with @media print CSS, letter page size, and total weight calculation
- **StudentCheckInButton** component ready to drop into student schedule cards (15-minute pre-flight window)

## Task Commits

1. **Task 1:** /dispatch board + DispatchModal + OverdueAlarm + StudentCheckInButton — `45ab4b5` (feat)
2. **Task 2:** /dispatch/close + /dispatch/manifest pages — `fb4cc08` (feat)

**Plan metadata:** _(this commit)_

## Files Created

- `apps/web/app/(app)/dispatch/page.tsx` — Server Component page shell with role guard
- `apps/web/app/(app)/dispatch/DispatchBoard.tsx` — 3-panel live board, 15s poll, opens DispatchModal
- `apps/web/app/(app)/dispatch/DispatchModal.tsx` — Multi-gate dispatch flow
- `apps/web/app/(app)/dispatch/FifGate.tsx` — Lists unacked FIF notices and exposes allAcked callback
- `apps/web/app/(app)/dispatch/OverdueAlarm.tsx` — sessionStorage diff + audio + banner
- `apps/web/app/(app)/dispatch/PassengerManifestPanel.tsx` — Inline manifest editor with PIC/SIC seed
- `apps/web/app/(app)/dispatch/close/[id]/page.tsx` — Server Component for close-out
- `apps/web/app/(app)/dispatch/close/[id]/CloseOutForm.tsx` — react-hook-form, useFieldArray for squawks
- `apps/web/app/(app)/dispatch/manifest/[id]/page.tsx` — Server-rendered print-friendly manifest
- `apps/web/app/(app)/dispatch/manifest/[id]/PrintButtonClient.tsx` — Client island for window.print()
- `apps/web/components/dispatch/StudentCheckInButton.tsx` — 15-min window check-in button
- `apps/web/public/sounds/overdue.wav` — 880Hz / 0.25s tone (4KB, generated via Python wave module)

## Verification Gate Results

| Gate                                       | Result                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm -r typecheck`                        | clean                                                                                        |
| `pnpm -r lint`                             | clean (no banned-term violations)                                                            |
| `pnpm --filter ./apps/web build`           | clean — 33 total routes (was 30)                                                             |
| New routes                                 | /dispatch (4.4 kB), /dispatch/close/[id] (1.71 kB), /dispatch/manifest/[id] (347 B)          |
| Banned-term audit                          | The word "approved" appears 0 times in apps/web/** literals                                  |
| Polling interval                           | 15000 ms with refetchIntervalInBackground=false                                              |
| Overdue diff                               | sessionStorage seen-set keyed at `p61.dispatch.seenOverdue.v1`                               |

## Decisions Made

- Plan said `overdue.mp3` but a generated WAV is simpler and equally browser-supported. The artifact requirement was "a short tone in public/sounds/" — fidelity over filename.
- The manifest page is a pure Server Component except for the `<PrintButtonClient />` island. This keeps the printed surface JS-free and trivially fast.
- The close-out form drops `zodResolver` (mirroring Wave 3's documented decision) to avoid the rhf 7.72 + @hookform/resolvers/zod type clash. Server-side zod input validation in `dispatch.closeOut` keeps the contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Audio file format swap**

- **Found during:** Task 1 (creating public/sounds/overdue.mp3)
- **Issue:** Generating a valid MP3 from scratch requires an encoder library; the planner expected something tiny and self-contained. Inline base64 MP3 bytes would be opaque and brittle.
- **Fix:** Generated `overdue.wav` (4044 bytes, 880Hz tone, 0.25s, 8kHz mono PCM) via Python's stdlib `wave` module. Updated OverdueAlarm to load `/sounds/overdue.wav`. Browsers play WAV natively.
- **Files modified:** apps/web/public/sounds/overdue.wav, apps/web/app/(app)/dispatch/OverdueAlarm.tsx
- **Verification:** File exists, build succeeds, audio path resolved at static asset URL
- **Commit:** 45ab4b5

**2. [Rule 1 - Bug] FifGate parent callback in useEffect deps**

- **Found during:** Task 1 (writing FifGate)
- **Issue:** First draft of FifGate called `onAllAcked(notices.length === 0)` from a useEffect with `[notices.length]` deps, which would either trip exhaustive-deps lint or fire on every parent re-render if the callback identity changed. The dirty hack of a custom `useMemoEffect` was confusing.
- **Fix:** Stored the callback in a `useRef`, sync it from a small effect, and call `cbRef.current(...)` from the deps-watching effect. Standard pattern, no lint violation.
- **Files modified:** apps/web/app/(app)/dispatch/FifGate.tsx
- **Verification:** lint clean
- **Commit:** 45ab4b5

### Rule 4 (Architectural) decisions

None. Plan shape matched the codebase cleanly.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes preserved scope and verification semantics. WAV vs MP3 is functionally identical for the user.

## Authentication Gates

None. All work was UI on top of the existing tRPC surface from 03-02.

## Next Phase Readiness

Phase 3's user-facing scheduling + dispatch experience is now functionally complete. The remaining Phase 3 plan (FIF admin UI + final verification, plan 05) can build on top of the dispatch screen and the FifGate component pattern. After plan 05 the phase wraps and we transition to Phase 4 (CAMP, real isAirworthyAt() body).

## Self-Check: PASSED

Verified files exist:

- apps/web/app/(app)/dispatch/page.tsx — FOUND
- apps/web/app/(app)/dispatch/DispatchBoard.tsx — FOUND
- apps/web/app/(app)/dispatch/DispatchModal.tsx — FOUND
- apps/web/app/(app)/dispatch/FifGate.tsx — FOUND
- apps/web/app/(app)/dispatch/OverdueAlarm.tsx — FOUND
- apps/web/app/(app)/dispatch/PassengerManifestPanel.tsx — FOUND
- apps/web/app/(app)/dispatch/close/[id]/page.tsx — FOUND
- apps/web/app/(app)/dispatch/close/[id]/CloseOutForm.tsx — FOUND
- apps/web/app/(app)/dispatch/manifest/[id]/page.tsx — FOUND
- apps/web/app/(app)/dispatch/manifest/[id]/PrintButtonClient.tsx — FOUND
- apps/web/components/dispatch/StudentCheckInButton.tsx — FOUND
- apps/web/public/sounds/overdue.wav — FOUND

Verified commits:

- 45ab4b5 — FOUND in git log
- fb4cc08 — FOUND in git log

Gate results: `pnpm -r typecheck` clean, `pnpm -r lint` clean, `pnpm --filter ./apps/web build` clean (33 routes).
