---
phase: 07-adsb-fleet-integration
plan: 02
subsystem: ui
tags: [maplibre, react-map-gl, fleet-map, geofence, turf, terra-draw, geojson, sdf-icons]

# Dependency graph
requires:
  - phase: 07-adsb-fleet-integration
    plan: 01
    provides: tRPC adsb router (fleetPositions, traffic), admin.geofence router (getActive, upsert, softDelete), AircraftPosition types
  - phase: 02-personnel-admin-fleet-primitives
    provides: aircraft.tail_number, bases table
provides:
  - /fleet-map page with dark MapLibre map, school aircraft + traffic layers
  - Geofence overlay rendering (polygon + circle), geofence editor (terra-draw), geofence alert banner
  - Fleet sidebar sorted airborne-first with click-to-center
  - Canvas-generated SDF airplane icon for MapLibre icon-color recoloring
  - useGeofenceCheck hook with turf.js booleanPointInPolygon
  - Fleet Map link in app header for all authenticated roles
affects: [07-03-replay-dispatch, 08-notifications]

# Tech tracking
tech-stack:
  added:
    - maplibre-gl ^5.22
    - react-map-gl ^8.1
    - '@turf/boolean-point-in-polygon ^7.3'
    - '@turf/circle ^7.3'
    - '@turf/helpers ^7.3'
    - terra-draw ^1.28
    - terra-draw-maplibre-gl-adapter
    - '@watergis/maplibre-gl-terradraw ^1.13'
    - '@types/geojson ^7946'
  patterns:
    - 'Canvas-generated SDF airplane icon at map load time (no static PNG needed)'
    - 'react-map-gl/maplibre with native MapLibre GeoJSON Source + symbol/fill/line Layers'
    - 'Dynamic import of terra-draw to avoid SSR issues in Next.js'
    - 'Data-driven icon-color and icon-opacity via MapLibre expressions for status visualization'
    - 'requestAnimationFrame-based pulse animation for signal-lost aircraft'
    - 'Client-side geofence check with memoized polygon conversion'

key-files:
  created:
    - apps/web/app/(app)/fleet-map/page.tsx
    - apps/web/app/(app)/fleet-map/FleetMapClient.tsx
    - apps/web/app/(app)/fleet-map/_components/AircraftLayer.tsx
    - apps/web/app/(app)/fleet-map/_components/AircraftPopup.tsx
    - apps/web/app/(app)/fleet-map/_components/TrafficLayer.tsx
    - apps/web/app/(app)/fleet-map/_components/TrafficPopup.tsx
    - apps/web/app/(app)/fleet-map/_components/FleetSidebar.tsx
    - apps/web/app/(app)/fleet-map/_components/FeedStatusBanner.tsx
    - apps/web/app/(app)/fleet-map/_components/GeofenceOverlay.tsx
    - apps/web/app/(app)/fleet-map/_components/GeofenceEditor.tsx
    - apps/web/app/(app)/fleet-map/_components/GeofenceAlert.tsx
    - apps/web/app/(app)/fleet-map/_components/useGeofenceCheck.ts
  modified:
    - apps/web/app/(app)/layout.tsx
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - 'Canvas-generated SDF airplane icon instead of static PNG -- avoids needing a file asset and works reliably across environments'
  - "Page uses 'use client' directive with next/dynamic ssr:false -- Next.js 15 disallows ssr:false in Server Components"
  - 'Geofence admin detection via trpc.admin.geofence.getActive query error -- non-admins see overlay/alerts but not editor'
  - 'Terra-draw dynamically imported to avoid SSR issues -- loaded only when admin initiates draw mode'
  - 'Circle geofences saved as GeoJSON Point + radiusNm, converted to 72-sided polygon via @turf/circle for rendering and point-in-polygon checks'

patterns-established:
  - "MapLibre 'use client' page pattern: page.tsx is client component with dynamic(() => import('./Client'), { ssr: false })"
  - 'SDF icon generation: canvas-draw airplane shape, addImage with { sdf: true }, recolor via icon-color expression'
  - 'Geofence check pattern: memoize polygon conversion, run booleanPointInPolygon on each poll cycle for airborne aircraft only'

requirements-completed: [ADS-02, ADS-03, ADS-04, ADS-05]

# Metrics
duration: 43min
completed: 2026-04-10
---

# Phase 7 Plan 02: Fleet Map UI Summary

**Live fleet map with dark MapLibre map, school aircraft colored by status with tail labels, surrounding traffic, geofence drawing/overlay/alerts, fleet sidebar, and 5s polling**

## Performance

- **Duration:** 43 min
- **Started:** 2026-04-10T22:40:35Z
- **Completed:** 2026-04-10T23:23:40Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Full /fleet-map page with dark-themed MapLibre map (CARTO dark-matter tiles) using react-map-gl/maplibre
- School aircraft as large SDF airplane icons colored by status (green=airborne, yellow=ground, red=grounded, blue=dispatched, gray=signal-lost), with tail number labels and heading rotation
- Surrounding traffic as smaller white rotated airplane icons, visually distinct from fleet
- 5s polling via TanStack Query with pause-on-hidden tab, stale >60s faded, signal-lost >300s pulsing gray animation
- Click school aircraft shows popup with altitude/speed/heading then deep-links to /admin/aircraft/[id]
- Click traffic shows popup with ICAO, callsign, altitude, speed, heading, aircraft type, age
- Fleet sidebar sorted airborne-first with colored status dots, click centers map on aircraft
- Geofence overlay renders as semi-transparent blue fill + border line layer (polygon and circle types)
- Admin geofence editor with terra-draw polygon/circle drawing, save/cancel/delete controls
- Client-side turf.js booleanPointInPolygon check on each 5s poll cycle
- Red alert banner for aircraft outside training area boundary, auto-clears on re-entry
- Feed offline banner when ADS-B Tracker unreachable
- "Fleet Map" link in app header for all authenticated roles

## Task Commits

Each task was committed atomically:

1. **Task 1: Fleet map page + aircraft/traffic layers + sidebar + header link** - `8143ac5` (feat)
2. **Task 2: Geofence overlay + editor + alert + turf.js check** - `b12966c` (feat)

## Files Created/Modified

- `apps/web/app/(app)/fleet-map/page.tsx` - Client component shell with dynamic import (ssr: false)
- `apps/web/app/(app)/fleet-map/FleetMapClient.tsx` - Main orchestrator: Map, polling, layers, sidebar, geofence wiring, canvas SDF icon generation
- `apps/web/app/(app)/fleet-map/_components/AircraftLayer.tsx` - School fleet GeoJSON source + symbol layer with data-driven color/opacity, click-to-popup, signal-lost pulsing
- `apps/web/app/(app)/fleet-map/_components/AircraftPopup.tsx` - Popup with tail, altitude (ft), speed (kts), heading, status chip, "View Aircraft" deep-link button
- `apps/web/app/(app)/fleet-map/_components/TrafficLayer.tsx` - Traffic GeoJSON source + smaller white symbol layer, click-to-popup
- `apps/web/app/(app)/fleet-map/_components/TrafficPopup.tsx` - Compact popup: ICAO, callsign, altitude, speed, heading, type, age
- `apps/web/app/(app)/fleet-map/_components/FleetSidebar.tsx` - Collapsible sidebar, airborne-first sort, status dots, click-to-center
- `apps/web/app/(app)/fleet-map/_components/FeedStatusBanner.tsx` - Amber banner with retry countdown when feed offline
- `apps/web/app/(app)/fleet-map/_components/GeofenceOverlay.tsx` - Semi-transparent blue fill + line layer, circle-to-polygon conversion
- `apps/web/app/(app)/fleet-map/_components/GeofenceEditor.tsx` - Admin terra-draw polygon/circle editor, save/cancel/delete, session baseId lookup
- `apps/web/app/(app)/fleet-map/_components/GeofenceAlert.tsx` - Red urgent banner listing aircraft outside training area
- `apps/web/app/(app)/fleet-map/_components/useGeofenceCheck.ts` - Memoized turf.js booleanPointInPolygon on each poll cycle
- `apps/web/app/(app)/layout.tsx` - Added "Fleet Map" nav link alongside My Record and Flight Log
- `apps/web/package.json` - Added maplibre-gl, react-map-gl, turf modules, terra-draw, watergis adapter
- `pnpm-lock.yaml` - Updated lockfile with 60+ new packages

## Decisions Made

1. **Canvas-generated SDF airplane icon**: Generated a 64x64 white airplane silhouette on a canvas at map load time instead of requiring a static PNG file. The SDF mode enables MapLibre's `icon-color` paint property to recolor the icon per status.

2. **Client component page with dynamic import**: Next.js 15 App Router disallows `ssr: false` in Server Components. The page.tsx uses `'use client'` with `dynamic(() => import('./FleetMapClient'), { ssr: false })` to avoid WebGL hydration issues.

3. **Admin detection via query error**: Non-admin users get a 403 from `trpc.admin.geofence.getActive`. The GeofenceEditor checks this query's error state and renders nothing for non-admins. The overlay/alert in FleetMapClient handle null geofence gracefully.

4. **Dynamic terra-draw import**: Terra-draw is loaded via `await import('terra-draw')` only when an admin clicks "Draw Polygon" or "Draw Circle". This avoids SSR issues and reduces initial bundle size.

5. **Circle storage as Point + radiusNm**: Circle geofences are saved as a GeoJSON Point center with a separate `radiusNm` field. Rendering and point-in-polygon checks convert to a 72-sided polygon via `@turf/circle`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next.js 15 ssr:false not allowed in Server Components**

- **Found during:** Task 1 (page shell creation)
- **Issue:** `next/dynamic` with `ssr: false` throws a build error in Server Components in Next.js 15
- **Fix:** Made page.tsx a `'use client'` component, keeping the dynamic import with ssr: false
- **Files modified:** apps/web/app/(app)/fleet-map/page.tsx
- **Verification:** Build passes, page renders correctly
- **Committed in:** 8143ac5

**2. [Rule 3 - Blocking] Missing terra-draw-maplibre-gl-adapter peer dependency**

- **Found during:** Task 2 (geofence editor)
- **Issue:** `@watergis/maplibre-gl-terradraw` requires `terra-draw-maplibre-gl-adapter` as a peer dependency
- **Fix:** Installed `terra-draw-maplibre-gl-adapter` package
- **Files modified:** apps/web/package.json, pnpm-lock.yaml
- **Verification:** Terra-draw import resolves, typecheck passes
- **Committed in:** b12966c

**3. [Rule 2 - Missing Critical] GeofenceEditor needs baseId for new geofences**

- **Found during:** Task 2 (geofence editor save logic)
- **Issue:** When no geofence exists yet, `geofence?.baseId` is null but upsert mutation requires a baseId
- **Fix:** Added `trpc.me.get` query to fetch session's `activeBaseId` as fallback when no existing geofence
- **Files modified:** apps/web/app/(app)/fleet-map/\_components/GeofenceEditor.tsx
- **Verification:** Save works both for new and replacement geofences
- **Committed in:** b12966c

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical)
**Impact on plan:** All fixes necessary for correctness and build pass. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None -- no external service configuration required. Map tiles load from public CARTO CDN. ADS-B Tracker connection uses existing `ADSB_API_BASE_URL` env var from Phase 1.

## Next Phase Readiness

- Plan 07-03 (track replay + dispatch deep-links) can proceed: fleet map infrastructure is complete
- Track replay page at `/fleet-map/replay/[tailNumber]` will use the existing `trpc.adsb.flightTrack` procedure and MapLibre `line-gradient`
- Dispatch screen deep-links will link to `/fleet-map` centered on specific aircraft
- All geofence client-side check infrastructure is in place for Phase 8 server-side checking

---

_Phase: 07-adsb-fleet-integration_
_Completed: 2026-04-10_
