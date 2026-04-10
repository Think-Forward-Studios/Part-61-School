# Phase 7: ADS-B Fleet Integration - Research

**Researched:** 2026-04-10
**Domain:** Real-time map visualization, ADS-B REST API integration, geospatial operations
**Confidence:** HIGH

## Summary

Phase 7 integrates the existing ADS-B Tracker service (Fastify on port 3002, backed by DuckDB over FAA SWIM parquet files) into the Part 61 School app. The school app is a **consumer** of the Tracker's three SWIM endpoints (`/api/swim/latest`, `/api/swim/tracks`, `/api/swim/stats`) -- it never ingests ADS-B data directly.

The core map stack is **react-map-gl v8.1 + maplibre-gl v5.x** (matching the Tracker's versions). react-map-gl v8 is the first version to natively support MapLibre GL v5 via the `react-map-gl/maplibre` import path -- no shim or mapbox-gl placeholder needed. MapLibre symbol layers with `icon-rotate` handle heading-rotated aircraft icons natively. Geofence checking uses tree-shakeable turf.js modules (`@turf/boolean-point-in-polygon` + `@turf/circle`). Geofence drawing uses terra-draw + `@watergis/maplibre-gl-terradraw` for polygon and circle geometry creation. Track replay uses MapLibre's built-in `line-gradient` paint property with `line-progress` for graduated polylines.

**Primary recommendation:** Build a thin `AdsbProvider` interface in `packages/domain`, implement `SwimAdsbProvider` in `packages/api/src/providers/adsb/`, expose via two tRPC routers (`adsb` for all roles, `admin.geofence` for admin), and create a `'use client'` fleet map at `/fleet-map` using react-map-gl/maplibre with native MapLibre layers (no Deck.gl).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **MapLibre GL JS only** -- no Deck.gl in the school app. Plain MapLibre with GeoJSON source + symbol/circle layers. Match `maplibre-gl ^5.x` + `react-map-gl ^8.1` (same versions as the Tracker).
2. **School aircraft = large colored icons** (green/yellow/red/blue) + tail labels; traffic = small white airplane icons, rotated to heading.
3. **AdsbProvider interface** in `packages/domain/src/adsb.ts` with `SwimAdsbProvider` implementation in `packages/api/src/providers/adsb/swim.ts` calling the Tracker REST API.
4. **5s polling** via TanStack Query `refetchInterval: 5000`, `refetchIntervalInBackground: false`.
5. **Geofence: both polygon AND circle types**, one per base, stored as GeoJSON, client-side `turf.booleanPointInPolygon` check.
6. **Geofence alerts:** map banner + dispatch badge + in-app notification, auto-clear on re-entry.
7. **Track replay** at `/fleet-map/replay/[tailNumber]` with graduated polyline + XC route overlay.
8. **Stale data:** >60s faded, >300s signal-lost with pulsing gray icon.
9. `/fleet-map` route under `(app)`, fleet sidebar sorts airborne to top, "Fleet Map" link in header for all roles.
10. Dispatch screen gets "Fleet Map" deep-link per dispatched flight.

### Claude's Discretion

- Exact MapLibre style URL (dark vs light -- dark matches the Tracker) --> **Recommend: dark-matter**
- Animation speed for the track replay slider --> **Recommend: 1x/2x/4x selector, default 2x**
- Popup content layout for traffic aircraft --> **Recommend: compact card with ICAO, callsign, alt, speed, heading, age**
- Whether the fleet sidebar is collapsible or always visible --> **Recommend: collapsible, default open on desktop, collapsed on narrow**
- Exact zoom level on center --> **Recommend: zoom 11 for ~20nm radius**
- ADS-B Tracker down handling --> **Recommend: "ADS-B feed offline" banner with retry countdown**
- `turf.js` vs custom point-in-polygon --> **Recommend: turf.js -- 3 tree-shaken modules, ~5KB gzipped total**
- Geofence drawing tool library --> **Recommend: terra-draw via `@watergis/maplibre-gl-terradraw` -- OSS, MapLibre-native, supports polygon+circle modes**

### Deferred Ideas (OUT OF SCOPE)

- Email/SMS geofence breach alerts (Phase 8)
- Server-side geofence checking (Phase 8)
- Weather overlay (v2)
- Local ADS-B receiver ingestion (explicitly excluded)
- Mobile fleet map (v2)
- Historical track replay beyond most-recent flight (v2)
- Multi-school fleet map (v2)
- Airspace overlay (v2)
- Aircraft icon customization per aircraft (v2)
- Real-time ETA calculation (v2)
- Student "where is my aircraft" widget (Phase 8 polish)
- Map tile style switcher (Phase 8 polish)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                             | Research Support                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADS-01 | Integrate with existing ADS-B Tracker REST API via configurable `ADSB_API_BASE_URL`     | SwimAdsbProvider implementation calling 3 SWIM endpoints; response shapes fully documented from Tracker source                                                   |
| ADS-02 | Live fleet map with school aircraft position, altitude, speed, heading, last-update age | MapLibre symbol layer with GeoJSON source, 5s TanStack Query polling, `icon-rotate` for heading, stale-data opacity logic                                        |
| ADS-03 | Surrounding traffic in configurable bbox                                                | Same SWIM `/api/swim/latest` endpoint returns all aircraft in bbox; separate GeoJSON layer with smaller white icons                                              |
| ADS-04 | Click school aircraft -> deep-link to aircraft profile                                  | MapLibre click handler on school-fleet layer -> `router.push('/admin/aircraft/[id]')`                                                                            |
| ADS-05 | Geofence alerts when school aircraft outside training area                              | Geofence table (polygon/circle), terra-draw for admin drawing, `@turf/boolean-point-in-polygon` client-side check on each poll                                   |
| ADS-06 | Flight track replay for most recent flight                                              | `/api/swim/tracks` endpoint returns coordinate arrays; MapLibre `line-gradient` with `line-progress` for graduated color; requestAnimationFrame slider animation |
| ADS-07 | AdsbProvider abstraction interface                                                      | TypeScript interface in `packages/domain/src/adsb.ts`; SwimAdsbProvider in `packages/api/src/providers/adsb/swim.ts`                                             |

</phase_requirements>

## Standard Stack

### Core

| Library                          | Version | Purpose                                   | Why Standard                                                                    |
| -------------------------------- | ------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `maplibre-gl`                    | `^5.20` | WebGL map rendering engine                | OSS fork of Mapbox GL, same version as the Tracker, free tile source compatible |
| `react-map-gl`                   | `^8.1`  | React wrapper for MapLibre                | Official visgl wrapper, v8 natively supports MapLibre v5 via `/maplibre` import |
| `@turf/boolean-point-in-polygon` | `^7.2`  | Geofence point-in-polygon check           | Industry-standard geospatial lib, tree-shakeable modules                        |
| `@turf/circle`                   | `^7.2`  | Convert circle center+radius to polygon   | Generates N-sided polygon approximation for radius geofences                    |
| `@turf/helpers`                  | `^7.2`  | GeoJSON constructors (`point`, `polygon`) | Shared dependency of above turf modules                                         |

### Supporting

| Library                           | Version | Purpose                                                | When to Use                                              |
| --------------------------------- | ------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `terra-draw`                      | `^1.27` | Drawing engine (polygon, circle) for geofence creation | Admin geofence editor only                               |
| `@watergis/maplibre-gl-terradraw` | `^1.x`  | MapLibre control wrapper for terra-draw                | Adds draw controls to map, handles MapLibre adapter glue |

### Alternatives Considered

| Instead of      | Could Use                | Tradeoff                                                                           |
| --------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| terra-draw      | `@mapbox/mapbox-gl-draw` | Unmaintained, compatibility issues with MapLibre v5, no built-in circle mode       |
| terra-draw      | MapLibre-Geoman          | Commercial license required for Pro features, overkill for simple polygon+circle   |
| turf.js modules | Custom ray-casting       | Hand-rolled misses edge cases (antimeridian, self-intersecting polygons, holes)    |
| react-map-gl    | Raw MapLibre GL JS       | Loses React lifecycle integration, manual cleanup, no declarative layer management |

**Installation:**

```bash
# In apps/web
pnpm add maplibre-gl react-map-gl @turf/boolean-point-in-polygon @turf/circle @turf/helpers terra-draw @watergis/maplibre-gl-terradraw
```

## Architecture Patterns

### Recommended Project Structure

```
packages/domain/src/
  adsb.ts                           # AdsbProvider interface + AircraftPosition/TrackPoint/FeedStats types + BBox type

packages/api/src/
  providers/adsb/
    provider.ts                     # Re-exports AdsbProvider from domain
    swim.ts                         # SwimAdsbProvider implementation (fetch calls to Tracker)
  routers/
    adsb.ts                         # protectedProcedure: fleetPositions, traffic, flightTrack, feedStats
    admin/
      geofence.ts                   # adminProcedure: CRUD for geofence table

packages/db/src/schema/
  geofence.ts                       # Drizzle schema for geofence table + RLS + audit trigger

apps/web/app/(app)/
  fleet-map/
    page.tsx                        # Server component shell, dynamic imports FleetMapClient
    FleetMapClient.tsx              # 'use client' -- Map + sidebar + geofence overlay
    _components/
      AircraftLayer.tsx             # School fleet GeoJSON source + symbol layer
      TrafficLayer.tsx              # Traffic GeoJSON source + symbol layer
      GeofenceOverlay.tsx           # Renders geofence polygon as fill+line layer
      GeofenceEditor.tsx            # Admin-only terra-draw polygon/circle editor
      FleetSidebar.tsx              # Aircraft list sorted by status
      GeofenceAlert.tsx             # Red banner for out-of-geofence aircraft
      FeedStatusBanner.tsx          # "ADS-B feed offline" indicator
    replay/
      [tailNumber]/
        page.tsx                    # Server component shell
        ReplayClient.tsx            # 'use client' -- track replay with line-gradient
```

### Pattern 1: SSR-Safe Map Loading

**What:** MapLibre requires DOM/WebGL. Must be loaded client-side only in Next.js App Router.
**When to use:** Every page that renders a map.
**Example:**

```typescript
// apps/web/app/(app)/fleet-map/page.tsx (Server Component)
import dynamic from 'next/dynamic';

const FleetMapClient = dynamic(() => import('./FleetMapClient'), {
  ssr: false,
  loading: () => <div style={{ height: '100vh', background: '#0a0a0a' }}>Loading map...</div>,
});

export default function FleetMapPage() {
  return <FleetMapClient />;
}
```

### Pattern 2: react-map-gl/maplibre with Native Layers

**What:** Use MapLibre's native GeoJSON sources and symbol layers instead of Deck.gl overlays.
**When to use:** School aircraft and traffic rendering (< 1000 features).
**Example:**

```typescript
// FleetMapClient.tsx ('use client')
import Map, { Source, Layer, NavigationControl, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { SymbolLayerSpecification } from 'maplibre-gl';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// GeoJSON FeatureCollection built from ADS-B positions
const fleetGeoJson: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: positions.map((p) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
    properties: {
      tailNumber: p.tailNumber,
      heading: p.trueTrack,
      status: p.status, // 'airborne' | 'ground' | 'grounded' | 'no_signal'
      staleSeconds: p.staleSeconds,
      aircraftId: p.aircraftId, // for deep-link
    },
  })),
};

// Symbol layer for school aircraft
const fleetLayer: SymbolLayerSpecification = {
  id: 'fleet-aircraft',
  type: 'symbol',
  source: 'fleet',
  layout: {
    'icon-image': [
      'match',
      ['get', 'status'],
      'airborne',
      'aircraft-green',
      'ground',
      'aircraft-yellow',
      'grounded',
      'aircraft-red',
      'aircraft-blue', // dispatched, no signal yet
    ],
    'icon-size': 0.8,
    'icon-rotate': ['get', 'heading'],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': true,
    'text-field': ['get', 'tailNumber'],
    'text-offset': [0, 1.5],
    'text-size': 11,
    'text-font': ['Open Sans Bold'],
  },
  paint: {
    'icon-opacity': [
      'case',
      ['>', ['get', 'staleSeconds'], 300],
      0.3,
      ['>', ['get', 'staleSeconds'], 60],
      0.6,
      1,
    ],
    'text-color': '#ffffff',
    'text-halo-color': '#000000',
    'text-halo-width': 1,
  },
};
```

### Pattern 3: AdsbProvider Abstraction

**What:** TypeScript interface in domain, implementation in API, consumed by tRPC router.
**When to use:** All ADS-B data access goes through this interface.
**Example:**

```typescript
// packages/domain/src/adsb.ts
export interface BBox {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}

export interface AircraftPosition {
  icao24: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  baroAltitude: number | null; // meters
  velocity: number | null; // m/s
  trueTrack: number | null; // degrees
  verticalRate: number | null; // m/s
  onGround: boolean;
  squawk: string | null;
  apiTime: number; // unix epoch seconds
  // Flight plan fields (from SWIM TAIS)
  acType: string | null;
  airport: string | null;
}

export interface TrackPoint {
  icao24: string;
  callsign: string | null;
  lons: number[];
  lats: number[];
  alts: (number | null)[];
  pointCount: number;
  firstSeen: number; // unix epoch seconds
  lastSeen: number;
  avgVelocity: number | null;
  maxAltitude: number | null;
}

export interface FeedStats {
  totalPositions: number;
  uniqueAircraft: number;
  earliestTime: number;
  latestTime: number;
  identifiedAircraft: number;
  withCallsign: number;
}

export interface AdsbProvider {
  getFleetPositions(
    tailNumbers: string[],
    bbox: BBox,
    minutes?: number,
  ): Promise<AircraftPosition[]>;
  getTrafficInBbox(bbox: BBox, minutes?: number): Promise<AircraftPosition[]>;
  getFlightTrack(callsign: string, bbox: BBox, minutes?: number): Promise<TrackPoint | null>;
  getStats(): Promise<FeedStats>;
}
```

### Pattern 4: TanStack Query Polling for Live Map

**What:** 5s refetchInterval for fleet positions; pause when tab hidden.
**When to use:** Fleet map component.
**Example:**

```typescript
// Inside FleetMapClient.tsx
const { data: positions, isError } = trpc.adsb.fleetPositions.useQuery(
  { bbox: currentBbox },
  {
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev, // keep stale data visible during refetch
  },
);
```

### Pattern 5: Track Replay with line-gradient

**What:** MapLibre `line-gradient` with `line-progress` for time-graduated color.
**When to use:** Replay page at `/fleet-map/replay/[tailNumber]`.
**Example:**

```typescript
// GeoJSON source MUST have lineMetrics: true
<Source
  id="replay-track"
  type="geojson"
  lineMetrics={true}
  data={trackLineString}
>
  <Layer
    id="replay-line"
    type="line"
    paint={{
      'line-width': 4,
      'line-gradient': [
        'interpolate', ['linear'], ['line-progress'],
        0, '#3b82f6',   // blue (oldest)
        0.5, '#22c55e', // green (middle)
        1, '#ef4444',   // red (newest)
      ],
    }}
  />
</Source>
```

### Pattern 6: Geofence Client-Side Check

**What:** On each 5s poll, run `booleanPointInPolygon` for each school aircraft against the active geofence.
**When to use:** After receiving fresh positions in the fleet map component.
**Example:**

```typescript
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { circle as turfCircle } from '@turf/circle';
import { point } from '@turf/helpers';

function checkGeofence(
  positions: AircraftPosition[],
  geofence: { kind: 'polygon' | 'circle'; geometry: GeoJSON.Geometry; radiusNm: number | null },
): string[] {
  // Convert circle to polygon if needed
  let fence: GeoJSON.Feature<GeoJSON.Polygon>;
  if (geofence.kind === 'circle') {
    const center = (geofence.geometry as GeoJSON.Point).coordinates;
    // turf.circle takes radius in km; 1nm = 1.852km
    fence = turfCircle(center, (geofence.radiusNm ?? 20) * 1.852, { steps: 72 });
  } else {
    fence = { type: 'Feature', geometry: geofence.geometry as GeoJSON.Polygon, properties: {} };
  }

  const outsideTails: string[] = [];
  for (const pos of positions) {
    const pt = point([pos.longitude, pos.latitude]);
    if (!booleanPointInPolygon(pt, fence)) {
      outsideTails.push(pos.callsign ?? pos.icao24);
    }
  }
  return outsideTails;
}
```

### Anti-Patterns to Avoid

- **Importing full `@turf/turf` bundle:** Use individual tree-shakeable modules (`@turf/boolean-point-in-polygon`, `@turf/circle`, `@turf/helpers`). The full bundle is 250KB+.
- **Running MapLibre in a Server Component:** MapLibre requires WebGL/DOM. Always `'use client'` or `dynamic(() => ..., { ssr: false })`.
- **Duplicating ADS-B ingestion logic:** The school app is a REST client. Never write parquet files, DuckDB queries, or SWIM consumers.
- **Polling when tab is hidden:** Wastes bandwidth and battery. Use `refetchIntervalInBackground: false`.
- **Storing real-time positions in Supabase:** Positions are ephemeral. Read from the Tracker on each poll. Only the geofence definition is persisted.

## Don't Hand-Roll

| Problem                      | Don't Build                           | Use Instead                                      | Why                                                                           |
| ---------------------------- | ------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Point-in-polygon check       | Ray-casting algorithm                 | `@turf/boolean-point-in-polygon`                 | Handles edge cases (on-edge, antimeridian, self-intersecting, holes)          |
| Circle to polygon conversion | Manual trig                           | `@turf/circle`                                   | Handles geodesic vs flat-earth correctly, configurable steps                  |
| Map drawing tool             | Custom click handlers + state machine | `terra-draw` + `@watergis/maplibre-gl-terradraw` | Drawing UX is complex (undo, vertex editing, snapping); terra-draw handles it |
| Map React wrapper            | Manual MapLibre lifecycle management  | `react-map-gl/maplibre`                          | Handles cleanup, event binding, resize, context correctly                     |
| Aircraft icon rotation       | CSS transforms on markers             | MapLibre `icon-rotate` layout property           | GPU-accelerated, works with clustering, no DOM overhead                       |
| Graduated polyline color     | Multiple overlapping line segments    | MapLibre `line-gradient` + `line-progress`       | Single draw call, GPU-rendered, smooth interpolation                          |

**Key insight:** MapLibre has built-in support for rotated icons, graduated line colors, and GeoJSON rendering. Using Deck.gl would add 300KB+ of JS for features MapLibre already provides natively for this scale (~10 school aircraft + ~100 traffic).

## Common Pitfalls

### Pitfall 1: MapLibre CSS Not Imported

**What goes wrong:** Map renders but controls, popups, and attribution are broken or invisible.
**Why it happens:** MapLibre GL requires its CSS file for proper rendering of UI elements.
**How to avoid:** Import `'maplibre-gl/dist/maplibre-gl.css'` in the client component file.
**Warning signs:** Missing zoom controls, overlapping text, invisible popup backgrounds.

### Pitfall 2: SSR Crash from MapLibre

**What goes wrong:** `ReferenceError: window is not defined` or `WebGLRenderingContext is not defined` during server render.
**Why it happens:** MapLibre accesses `window`, `document`, and WebGL at import time.
**How to avoid:** Use `next/dynamic` with `{ ssr: false }` for the page that imports MapLibre, OR ensure the component has `'use client'` and is only imported in a client tree. The `dynamic()` approach is safest.
**Warning signs:** Hydration errors, blank map area, server-side console errors.

### Pitfall 3: Callsign Matching Assumptions

**What goes wrong:** School aircraft not identified in ADS-B data despite being airborne.
**Why it happens:** SWIM callsign field may include trailing spaces, may not match tail number exactly (e.g., `N12345` in DB but `N12345  ` in SWIM, or pilot filed a different callsign). Some GA aircraft have callsigns without the "N" prefix in SWIM.
**How to avoid:** Normalize both sides: trim whitespace, uppercase, strip leading "N" for comparison. Match both `callsign === tail` and `callsign === tail.replace(/^N/, '')`. Log unmatched school aircraft for debugging.
**Warning signs:** Aircraft shows as traffic instead of fleet, or doesn't appear at all.

### Pitfall 4: Stale GeoJSON Source Updates

**What goes wrong:** Map doesn't update even though data changed.
**Why it happens:** react-map-gl uses referential equality for `data` prop on `<Source>`. If you mutate the same object, React sees no change.
**How to avoid:** Always pass a new GeoJSON object (spread or rebuild) when positions change. Or use a `key` prop tied to a poll counter.
**Warning signs:** Aircraft frozen on map despite console showing fresh data.

### Pitfall 5: line-gradient Requires lineMetrics

**What goes wrong:** `line-gradient` paint property has no effect; line renders as solid color.
**Why it happens:** MapLibre requires `lineMetrics: true` on the GeoJSON source for `line-progress` to work.
**How to avoid:** Always set `lineMetrics={true}` on the `<Source>` component when using `line-gradient`.
**Warning signs:** Solid-color line instead of gradient.

### Pitfall 6: CARTO Basemap Availability

**What goes wrong:** Map tiles fail to load, showing a gray background.
**Why it happens:** CARTO's free basemap CDN (`basemaps.cartocdn.com`) may have rate limits or downtime.
**How to avoid:** Use the style URL `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (publicly served). Have a fallback or error state. Do NOT hardcode CARTO API keys; these GL styles are served without authentication.
**Warning signs:** Tile 404 errors in network tab, blank/gray map.

### Pitfall 7: Geofence GeoJSON Storage Format

**What goes wrong:** Geofence saved in DB but `booleanPointInPolygon` fails or throws.
**Why it happens:** GeoJSON geometry stored as plain JSON but turf.js expects strict GeoJSON feature structure with coordinates arrays.
**How to avoid:** Validate GeoJSON on write with a zod schema. Store `geometry` as the raw GeoJSON Geometry object (not wrapped in Feature). Convert on read.
**Warning signs:** "Invalid input" errors from turf.js, geofence renders but no alerts fire.

### Pitfall 8: Bbox Calculation from Map Viewport

**What goes wrong:** Traffic query returns 0 results or too many results.
**Why it happens:** Bbox too narrow (only visible tiles) or too wide (entire hemisphere).
**How to avoid:** Use `map.getBounds()` (from the MapLibre map instance ref) to get the actual visible bbox. Or compute from viewport center + zoom level (as the Tracker does).
**Warning signs:** No traffic visible despite aircraft being nearby, or API returning 50K results.

## Code Examples

### ADS-B Tracker API Response Shapes (from source analysis)

**`GET /api/swim/latest?bbox=latMin,lonMin,latMax,lonMax&minutes=5`**

```typescript
// Response: { count: number, data: AircraftPosition[] }
// Each position:
{
  icao24: string;           // e.g. "a0b1c2"
  callsign: string | null;  // e.g. "N12345" (often = tail number for GA)
  latitude: number;          // decimal degrees
  longitude: number;         // decimal degrees
  baro_altitude: number | null;  // meters MSL
  velocity: number | null;       // m/s
  true_track: number | null;     // degrees (0=north, clockwise)
  vertical_rate: number | null;  // m/s
  on_ground: boolean;
  squawk: string | null;         // transponder code
  api_time: number;              // unix epoch SECONDS (not ms!)
  position_source: number;       // 3 or 4 = SWIM SCDS
  // Optional flight plan fields (when TAIS data available):
  ac_type?: string;              // e.g. "C172"
  airport?: string;              // destination airport
  entry_fix?: string;
  exit_fix?: string;
  flight_rules?: string;         // "IFR" | "VFR"
  flight_type?: string;
  requested_altitude?: number;
  assigned_altitude?: number;
}
```

**`GET /api/swim/tracks?bbox=latMin,lonMin,latMax,lonMax&minutes=30`**

```typescript
// Response: { count: number, data: TrackData[] }
// Each track:
{
  icao24: string;
  callsign: string | null;
  lons: number[];              // array of longitudes, time-ordered
  lats: number[];              // array of latitudes, time-ordered
  alts: (number | null)[];     // array of altitudes (meters), time-ordered
  point_count: number;
  first_seen: number;          // unix epoch seconds
  last_seen: number;           // unix epoch seconds
  avg_velocity: number | null; // m/s
  max_altitude: number | null; // meters
  // Optional flight plan fields (same as latest):
  ac_type?: string;
  airport?: string;
  // ... etc.
}
```

**`GET /api/swim/stats`**

```typescript
// Response: { data: StatsData }
{
  total_positions: number;
  unique_aircraft: number;
  earliest_time: number; // unix epoch seconds
  latest_time: number; // unix epoch seconds
  identified_aircraft: number;
  with_callsign: number;
}
```

**`GET /api/health`**

```typescript
// Response:
{
  status: 'ok' | 'error';
  duckdb: 'connected' | 'disconnected';
  uptime: number; // seconds
  timestamp: string; // ISO 8601
}
```

**Bbox format:** `latMin,lonMin,latMax,lonMax` (comma-separated, decimal degrees)

### Tail Number Matching Logic

```typescript
// packages/api/src/providers/adsb/swim.ts

/**
 * Normalize a tail number / callsign for comparison.
 * SWIM callsigns may have trailing spaces, lowercase, or missing N-prefix.
 */
function normalizeTail(raw: string | null): string {
  if (!raw) return '';
  return raw.trim().toUpperCase().replace(/^N/, '');
}

function matchSchoolAircraft(
  positions: SwimPosition[],
  schoolTails: string[],
): { fleet: SwimPosition[]; traffic: SwimPosition[] } {
  const normalizedSchool = new Set(schoolTails.map((t) => normalizeTail(t)));
  const fleet: SwimPosition[] = [];
  const traffic: SwimPosition[] = [];

  for (const pos of positions) {
    const normalized = normalizeTail(pos.callsign);
    if (normalizedSchool.has(normalized)) {
      fleet.push(pos);
    } else {
      traffic.push(pos);
    }
  }
  return { fleet, traffic };
}
```

### Geofence Table Schema

```typescript
// packages/db/src/schema/geofence.ts
import { sql } from 'drizzle-orm';
import {
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bases, schools } from './tenancy';

export const geofenceKindEnum = pgEnum('geofence_kind', ['polygon', 'circle']);

export const geofence = pgTable(
  'geofence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    kind: geofenceKindEnum('kind').notNull(),
    geometry: jsonb('geometry').notNull(), // GeoJSON Geometry object
    radiusNm: numeric('radius_nm'), // nullable, only for circle
    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    // RLS: same school, admin-only write
    pgPolicy('geofence_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('geofence_modify_admin_only', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (auth.jwt() ->> 'active_role') = 'admin'
      `,
      withCheck: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (auth.jwt() ->> 'active_role') = 'admin'
      `,
    }),
  ],
);

export type Geofence = typeof geofence.$inferSelect;
export type NewGeofence = typeof geofence.$inferInsert;
```

### Migration Numbering

```
-- Last Phase 6 migration: 0030_phase6_seed_minimum_hours.sql
-- Phase 7 migrations start at 0031:
--   0031_phase7_geofence.sql       -- geofence table + enum + RLS + audit trigger + base lat/lon columns
```

### Base Latitude/Longitude Addition

The `bases` table currently lacks `latitude`/`longitude` columns needed for map centering. These will be added in the Phase 7 migration:

```sql
ALTER TABLE bases
  ADD COLUMN latitude  double precision,
  ADD COLUMN longitude double precision;
```

The map centers on the active base's lat/lon. If null, defaults to a hardcoded center (e.g., continental US center or first school aircraft position).

### Dynamic Import Pattern for Map Page

```typescript
// apps/web/app/(app)/fleet-map/page.tsx
import dynamic from 'next/dynamic';

const FleetMapClient = dynamic(
  () => import('./FleetMapClient'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        height: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#555',
        fontFamily: 'monospace',
      }}>
        Initializing fleet map...
      </div>
    ),
  },
);

export default function FleetMapPage() {
  return <FleetMapClient />;
}
```

### Aircraft Icon Strategy

```typescript
// Load SDF icons on map load for colorable aircraft symbols
// SDF (Signed Distance Field) icons allow recoloring via icon-color paint property

map.on('load', async () => {
  // Load a single airplane icon as SDF
  const img = await map.loadImage('/icons/airplane-sdf.png');
  map.addImage('airplane', img.data, { sdf: true });

  // Now use with data-driven icon-color:
  // Fleet layer: large, colored by status
  // Traffic layer: small, white
});

// react-map-gl equivalent: useMap() hook to access map instance
import { useMap } from 'react-map-gl/maplibre';

function AircraftIconLoader() {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map) return;
    map.loadImage('/icons/airplane-sdf.png').then((img) => {
      if (!map.hasImage('airplane')) {
        map.addImage('airplane', img.data, { sdf: true });
      }
    });
  }, [map]);
  return null;
}
```

## State of the Art

| Old Approach                             | Current Approach                               | When Changed     | Impact                                                    |
| ---------------------------------------- | ---------------------------------------------- | ---------------- | --------------------------------------------------------- |
| react-map-gl v7 with mapbox-gl shim      | react-map-gl v8 with native `/maplibre` import | v8.0.0 (2024)    | No more mapbox-gl placeholder package needed              |
| `@mapbox/mapbox-gl-draw` for drawing     | terra-draw (multi-provider, OSS)               | 2024-2025        | Better MapLibre v5 compatibility, circle drawing built-in |
| Deck.gl for all map layers               | Native MapLibre GeoJSON+symbol layers          | Always available | 300KB+ bundle savings for simple use cases                |
| CSS marker rotation                      | MapLibre `icon-rotate` layout property         | MapLibre v1+     | GPU-accelerated, no DOM overhead                          |
| Multiple colored polylines for gradients | `line-gradient` + `line-progress` expressions  | MapLibre v2+     | Single GPU draw call, smooth interpolation                |

**Deprecated/outdated:**

- `mapbox-gl` placeholder package for react-map-gl: no longer needed with v8's `/maplibre` import
- `@mapbox/mapbox-gl-draw`: unmaintained, compatibility issues with MapLibre v5+
- `maplibre-gl v4.x` and below: v5 has performance improvements; match the Tracker's version

## Open Questions

1. **SDF airplane icon asset**
   - What we know: MapLibre SDF icons allow runtime recoloring via `icon-color` paint property. A single SDF PNG serves all color variants (green, yellow, red, blue, white, gray).
   - What's unclear: The exact icon file needs to be created. An airplane silhouette pointing north (0 degrees), exported as a grayscale SDF PNG.
   - Recommendation: Generate a 64x64 SDF airplane icon using a canvas helper at build time (same pattern as the Tracker's `createArrowIcon()` but as a static asset). Or use an open-source airplane SVG converted to SDF via `@elastic/spritezero-cli --sdf`.

2. **CARTO free tier limits**
   - What we know: `basemaps.cartocdn.com` GL style URLs are publicly served without API keys. The Tracker uses them successfully.
   - What's unclear: Exact free-tier limits for 2025/2026. Older data mentions 75K map views/month.
   - Recommendation: Use dark-matter for v1. If rate-limited, switch to OpenFreeMap or MapTiler free tier. Monitor tile load errors.

3. **terra-draw React integration**
   - What we know: terra-draw is imperative. `@watergis/maplibre-gl-terradraw` wraps it as a MapLibre IControl. react-map-gl supports adding controls via `<div>` children or imperative `map.addControl()`.
   - What's unclear: Exact React wrapper pattern for clean lifecycle management.
   - Recommendation: Use `useMap()` hook to access the MapLibre map instance, add/remove the terra-draw control in a `useEffect`. Capture drawn geometry via terra-draw events, convert to GeoJSON, save to DB.

4. **Signal-lost pulsing gray icon**
   - What we know: MapLibre supports `icon-opacity` for fading. "Pulsing" requires animation.
   - What's unclear: MapLibre symbol layers don't natively support CSS-like keyframe animations.
   - Recommendation: Implement pulsing via a `requestAnimationFrame` loop that toggles opacity between 0.2 and 0.5 on the signal-lost layer, updating the paint property every 500ms. Alternatively, use a separate HTML marker for signal-lost aircraft (limited to <5 aircraft).

## Sources

### Primary (HIGH confidence)

- ADS-B Tracker source code at `/Users/christopher/Desktop/ADS-B Data/` -- directly read `services/analytics/src/routes/swim.ts`, `src/lib/api.ts`, `src/components/map/MapView.tsx` for exact API shapes, types, and MapLibre usage patterns
- ADS-B Tracker `package.json` -- confirmed `maplibre-gl: ^5.20.2`, `react-map-gl: ^8.1.0`
- Part 61 School existing schema -- `packages/db/src/schema/*.ts`, migration files through 0030
- Part 61 School `apps/web/package.json` -- confirmed `@tanstack/react-query: ^5.96.2` already installed

### Secondary (MEDIUM confidence)

- [react-map-gl v8 whats-new](https://visgl.github.io/react-map-gl/docs/whats-new) -- confirmed v8 MapLibre v5 support via `/maplibre` import
- [MapLibre line-gradient example](https://maplibre.org/maplibre-gl-js/docs/examples/create-a-gradient-line-using-an-expression/) -- confirmed `lineMetrics: true` requirement and `line-progress` usage
- [MapLibre plugins page](https://maplibre.org/maplibre-gl-js/docs/plugins/) -- confirmed terra-draw as listed MapLibre plugin
- [terra-draw npm](https://www.npmjs.com/package/terra-draw) -- confirmed v1.27, polygon+circle modes, MapLibre adapter
- [react-map-gl get started](https://visgl.github.io/react-map-gl/docs/get-started) -- confirmed install and CSS import pattern

### Tertiary (LOW confidence)

- CARTO free tier limits -- only 2017 data found (75K views/month). Current limits unverified. Flag for monitoring.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries verified against Tracker source and official docs; versions match
- Architecture: HIGH - Pattern follows established Tracker codebase + existing Part 61 School conventions (tRPC routers, domain types, Drizzle schema)
- ADS-B API shapes: HIGH - Read directly from Tracker source code
- Pitfalls: HIGH - Based on direct analysis of MapLibre docs and Tracker implementation patterns
- Geofence drawing tool (terra-draw): MEDIUM - Listed on MapLibre plugins page, npm published, but React wrapper pattern needs validation during implementation
- CARTO free tier: LOW - No current official documentation on limits found

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable libraries, locked Tracker API)
