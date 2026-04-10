---
phase: 07-adsb-fleet-integration
plan: 03
subsystem: ui
tags: [maplibre, react-map-gl, line-gradient, track-replay, dispatch-deep-links, animation]

# Dependency graph
requires:
  - phase: 07-adsb-fleet-integration
    plan: 02
    provides: Fleet map page, AircraftPopup, AircraftLayer, MapLibre map infrastructure, SDF airplane icon
  - phase: 07-adsb-fleet-integration
    plan: 01
    provides: tRPC adsb.flightTrack procedure returning TrackPoint + plannedRoute
  - phase: 03-scheduling-dispatch-execution
    provides: DispatchBoard component, reservation.route_string for XC flights
provides:
  - /fleet-map/replay/[tailNumber] track replay page with graduated polyline + animation
  - ReplayTrackLayer with MapLibre line-gradient (blue->green->red by time)
  - ReplayControls with play/pause, time slider, speed selector (1x/2x/4x), altitude readout
  - PlannedRouteOverlay showing XC route_string as formatted text
  - Dispatch board Fleet Map deep-links per dispatched flight row
  - Aircraft popup "View Track" replay link
  - Aircraft profile "View last flight" link
affects: [08-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'MapLibre line-gradient with lineMetrics:true for graduated polyline color'
    - 'requestAnimationFrame animation loop with speed multiplier for track replay'
    - 'Linear interpolation along coordinate arrays with bearing computation'

key-files:
  created:
    - apps/web/app/(app)/fleet-map/replay/[tailNumber]/page.tsx
    - apps/web/app/(app)/fleet-map/replay/[tailNumber]/ReplayClient.tsx
    - apps/web/app/(app)/fleet-map/_components/ReplayTrackLayer.tsx
    - apps/web/app/(app)/fleet-map/_components/PlannedRouteOverlay.tsx
    - apps/web/app/(app)/fleet-map/_components/ReplayControls.tsx
  modified:
    - apps/web/app/(app)/dispatch/DispatchBoard.tsx
    - apps/web/app/(app)/fleet-map/_components/AircraftPopup.tsx
    - apps/web/app/(app)/admin/aircraft/[id]/page.tsx

key-decisions:
  - 'PlannedRouteOverlay renders as text label (not dashed line) because waypoint geocoding service not available in v1'
  - 'Track replay uses 30-second base playback duration at 1x speed regardless of actual flight duration'
  - 'Aircraft marker uses amber (#f59e0b) color to distinguish from fleet status colors on the main map'

patterns-established:
  - 'Track replay page pattern: page.tsx client component with dynamic import (ssr:false) -> ReplayClient with MapProvider'
  - 'Animation interpolation pattern: progressRef + requestAnimationFrame + linear lerp between coordinate array indices'

requirements-completed: [ADS-06, ADS-04]

# Metrics
duration: 7min
completed: 2026-04-10
---

# Phase 7 Plan 03: Track Replay + Dispatch Deep-Links Summary

**Flight track replay page with graduated MapLibre polyline, requestAnimationFrame playback animation, dispatch board deep-links, and aircraft popup/profile replay links**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-10T23:30:15Z
- **Completed:** 2026-04-10T23:37:00Z
- **Tasks:** 1 (of 2; Task 2 is checkpoint:human-verify)
- **Files modified:** 8

## Accomplishments

- Track replay page at /fleet-map/replay/[tailNumber] with graduated polyline colored blue (oldest) through green to red (newest) using MapLibre line-gradient + lineMetrics
- Aircraft icon animates along the flight track via requestAnimationFrame with configurable speed (1x/2x/4x) and a time slider for scrubbing
- ReplayControls floating panel with play/pause, speed selector, departure/current/arrival times, duration, and altitude readout
- Planned XC route overlay as formatted text label when reservation has route_string
- Dispatch board rows in "Currently Flying" and "About to Fly" panels now have Fleet Map deep-link icon
- Fleet map AircraftPopup has "View Track" button linking to track replay
- Aircraft profile page has "View last flight" link to track replay

## Task Commits

Each task was committed atomically:

1. **Task 1: Track replay page + dispatch deep-links + aircraft popup replay link** - `6d2a176` (feat)

## Files Created/Modified

- `apps/web/app/(app)/fleet-map/replay/[tailNumber]/page.tsx` - Client component shell with dynamic import (ssr:false) for ReplayClient
- `apps/web/app/(app)/fleet-map/replay/[tailNumber]/ReplayClient.tsx` - Main replay orchestrator: MapLibre map, track fetching, animation loop, graduated polyline, planned route overlay
- `apps/web/app/(app)/fleet-map/_components/ReplayTrackLayer.tsx` - GeoJSON source with lineMetrics:true + line layer with line-gradient paint (blue->green->red via line-progress)
- `apps/web/app/(app)/fleet-map/_components/PlannedRouteOverlay.tsx` - Text overlay showing parsed route_string segments with arrow separators
- `apps/web/app/(app)/fleet-map/_components/ReplayControls.tsx` - Floating playback control panel: slider, play/pause, speed selector, time/altitude display
- `apps/web/app/(app)/dispatch/DispatchBoard.tsx` - Added Fleet Map airplane icon link per dispatched flight row
- `apps/web/app/(app)/fleet-map/_components/AircraftPopup.tsx` - Added "View Track" button alongside existing "View Aircraft" button
- `apps/web/app/(app)/admin/aircraft/[id]/page.tsx` - Added "View last flight" link next to aircraft heading

## Decisions Made

1. **PlannedRouteOverlay as text, not dashed line**: Since no waypoint geocoding service is wired up in v1, the planned XC route renders as a formatted text label (e.g., "KDFW -> KACT -> KAUS") rather than a dashed polyline. The track itself already shows the actual flight path.

2. **30-second base playback duration**: Track replays in ~30 seconds at 1x speed regardless of actual flight duration (which could be minutes or hours). The 2x and 4x multipliers scale from this base for responsive interaction.

3. **Amber aircraft marker**: The replay aircraft icon uses amber (#f59e0b) to distinguish it from the green/yellow/red/blue status colors used on the live fleet map.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required. Track replay uses the same ADS-B Tracker REST API already configured via `ADSB_API_BASE_URL`.

## Next Phase Readiness

- Phase 7 is complete pending human verification walkthrough (Task 2 checkpoint)
- All 7 ADS-B requirements (ADS-01 through ADS-07) have been implemented across Plans 01, 02, and 03
- Phase 8 (notifications) can proceed: geofence client-side check infrastructure and fleet map UI are complete

---

_Phase: 07-adsb-fleet-integration_
_Completed: 2026-04-10_
