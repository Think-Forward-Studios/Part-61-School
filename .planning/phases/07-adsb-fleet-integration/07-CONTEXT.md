# Phase 7: ADS-B Fleet Integration - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate the existing ADS-B Tracker service (at `/Users/christopher/Desktop/ADS-B Data`, REST API on port 3002 by default) into the Part 61 School app. Show where school aircraft actually are in real time, render surrounding traffic, highlight XC flight following tracks, define geofence training areas with alerts, and replay recent flights — all WITHOUT duplicating the ADS-B ingestion stack. The school app is a consumer of the Tracker's REST API, nothing more.

Phase 7 does NOT ship: any ADS-B data ingestion/processing, local receiver (dump1090) support, weather overlay, flight planning, mobile map, or Supabase Realtime push for position updates. Email/SMS geofence alerts belong to Phase 8 (notifications).

Covers requirements: ADS-01, ADS-02, ADS-03, ADS-04, ADS-05, ADS-06, ADS-07.

</domain>

<decisions>
## Implementation Decisions

### Map library

- **MapLibre GL JS only** — no Deck.gl in the school app. The existing ADS-B Tracker uses MapLibre + Deck.gl, but for ~10 school aircraft + surrounding traffic, plain MapLibre with GeoJSON source + symbol/circle layers is simpler, lighter, and sufficient. Match the MapLibre major version with the Tracker (`maplibre-gl ^5.x`).
- Install `maplibre-gl` + `react-map-gl` (the React wrapper used by the Tracker) into `apps/web`.
- Map component is `'use client'` (DOM + WebGL). Initial viewport centered on school's home airport (from `bases.latitude/longitude` — add these columns if missing, or use a hardcoded default until the admin sets them).
- **Map tile source:** use a free style like `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (dark theme matching the ADS-B Tracker aesthetic) or `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json` (light theme). Admin-configurable in Phase 8; hardcode for v1.

### Fleet vs traffic visual distinction

- **School aircraft = large colored airplane icons + tail number labels.** Color by status:
  - Green = airborne (position updating within last 60s)
  - Yellow = on ground / taxiing (position updating but alt ≈ field elevation)
  - Red = grounded by maintenance (no ADS-B signal expected, but shown as a pin at home airport for awareness)
  - Blue = dispatched but no ADS-B signal yet (recently dispatched, waiting for first position report)
- **Surrounding traffic = small white airplane icons.** No labels. Smaller than school aircraft. Rotated to heading. Visible in a school-configurable bbox (default: 20nm radius around home airport).
- **Clicking a school aircraft** deep-links to `/admin/aircraft/[id]` (its profile page with current reservation, fleet status, recent flights).
- **Clicking a traffic aircraft** shows a popup with: ICAO hex, callsign (if available), altitude, speed, heading, last update age. No deep-link (not a school aircraft).

### AdsbProvider interface (ADS-07)

- **TypeScript interface** in `packages/domain/src/adsb.ts`:
  ```typescript
  interface AdsbProvider {
    getFleetPositions(tailNumbers: string[]): Promise<AircraftPosition[]>;
    getTrafficInBbox(bbox: BBox, minutes?: number): Promise<AircraftPosition[]>;
    getFlightTrack(tailNumber: string, minutes?: number): Promise<TrackPoint[]>;
    getStats(): Promise<FeedStats>;
  }
  ```
- **Single implementation:** `SwimAdsbProvider` in `packages/api/src/providers/adsb/swim.ts` that calls the ADS-B Tracker REST API endpoints:
  - `GET /api/swim/latest?bbox=...&minutes=5` → fleet + traffic positions
  - `GET /api/swim/tracks?bbox=...&minutes=30` → flight tracks
  - `GET /api/swim/stats` → feed health
- **Env var:** `ADSB_API_BASE_URL` (already reserved since Phase 1). Default: `http://localhost:3002`.
- **No server-side caching in v1** — the ADS-B Tracker already caches at its DuckDB layer. The school app fetches fresh every poll.
- **Tail number matching:** the school app queries `aircraft.tail_number` from the school DB, then filters the ADS-B Tracker response to identify which positions belong to school aircraft. Matching by callsign field (which for GA is usually the tail number).

### Map refresh cadence

- **5-second polling via TanStack Query `refetchInterval: 5000`** on the `'use client'` map component. `refetchIntervalInBackground: false` (pause when tab hidden).
- The ADS-B Tracker's SWIM consumer updates at ~1800 positions/sec so data freshness is not the bottleneck — the 5s poll on the school side is purely for rendering cadence.
- **Stale data indicator:** if a school aircraft's last update is >60s old, render with a faded opacity + "Last seen: Xs ago" tooltip. If >300s (5 min), move to "signal lost" state — gray icon with a question mark overlay.

### Geofence (ADS-05)

- **Both polygon AND circle radius types.** Admin can define either shape per base.
- **Polygon:** admin clicks points on the map to define vertices. UI renders the polygon as a semi-transparent blue overlay while drawing, solidifies on save. Saved as GeoJSON `Polygon` geometry.
- **Circle:** admin sets center point (click on map or enter lat/lon of home airport) + radius in nautical miles. UI renders the circle. Saved as GeoJSON `Point` + `radius_nm` property. Converted to a polygon approximation (72-sided) for the point-in-polygon check.
- **One active geofence per base.** Admin can edit or replace.
- **Storage:** `geofence` table: `id`, `school_id`, `base_id`, `kind` enum (`polygon | circle`), `geometry jsonb` (GeoJSON), `radius_nm numeric` (nullable — only for circle kind), `label text`, `created_at`, `created_by`, `updated_at`, `deleted_at`. Audit trigger attached.
- **Alert logic:** on every 5s poll, after receiving school aircraft positions, the client runs a `turf.booleanPointInPolygon` check against the active geofence. If any school aircraft is outside:
  - **Map banner:** red banner at the top of the fleet map: "⚠ N12345 outside training area — last seen at [lat, lon] heading [hdg]°"
  - **Dispatch screen badge:** yellow badge on the fleet map nav link in the dispatch header: "1 aircraft outside geofence"
  - **In-app notification:** write to the Phase 8 notification surface (or a simple notification banner if Phase 8 isn't done yet)
  - **Auto-clear:** when the aircraft re-enters the geofence, banner dismisses automatically on next poll cycle.
- **Server-side geofence check is NOT implemented in Phase 7** — the check runs client-side in the map component. Server-side (for email/SMS alerts) is Phase 8.

### Flight track replay (ADS-06)

- **Route:** `/fleet-map/replay/[tailNumber]` — renders the most recent flight's track as a polyline on the map.
- **Data source:** calls `AdsbProvider.getFlightTrack(tailNumber, minutes=120)` which hits the ADS-B Tracker's `/api/swim/tracks?bbox=...&minutes=120` filtered to the tail number.
- **Rendering:** polyline on MapLibre with graduated color (green→yellow→red by time — older = cooler color). Aircraft icon animates along the track with a slider or play button.
- **Link from aircraft profile:** "View last flight" link on `/admin/aircraft/[id]` and on the fleet map's aircraft popup → opens the replay route.
- **XC flight following overlay:** if the aircraft has an active reservation with `route_string` (from Phase 3), render the planned route as a dashed line alongside the actual track. Visual diff of plan vs actual.

### Fleet map route + nav

- **Main route:** `/fleet-map` — accessible from the `(app)` route group header for all authenticated roles.
- **Sections:**
  - **Live map** — full-width map showing school aircraft + traffic
  - **Fleet sidebar** (or bottom panel on narrow screens) — list of school aircraft with status chips (airborne / on ground / grounded / signal lost), clicking one centers the map on that aircraft
  - **Geofence controls** — admin-only panel to draw/edit the training area polygon or circle
- **Not a separate app** — it's a page within the existing Part 61 School web app under the `(app)` route group.
- **Nav:** add "Fleet Map" link to the `(app)/layout.tsx` header, visible to all authenticated roles (students can see where their next aircraft is).

### Phase 3 dispatch integration

- **Dispatch screen (Phase 3) gets a "Fleet Map" deep-link** next to each dispatched flight's row — links to `/fleet-map` centered on that aircraft.
- **Phase 3 XC flight following fields** (`reservation.route_string`, `ete_minutes`, `stops[]`) are already defined. Phase 7 reads them and renders the planned route as a dashed overlay on the map when an aircraft has an active XC reservation.
- **Phase 3 overdue detection** (row turns red at `time_range.end + grace`) can be cross-referenced on the map — if an aircraft is both overdue AND outside the geofence, the map alert is escalated to red (not just yellow).

### Claude's Discretion

- Exact MapLibre style URL (dark vs light — dark matches the Tracker)
- Animation speed for the track replay slider
- Popup content layout for traffic aircraft
- Whether the fleet sidebar is collapsible or always visible
- Exact zoom level on center (recommend 11 for 20nm radius)
- How to handle the case where the ADS-B Tracker is down (show "ADS-B feed offline" banner)
- `turf.js` vs a custom point-in-polygon check (turf.js recommended — small bundle impact with tree-shaking)
- Whether the geofence drawing tool uses a library (e.g. `@mapbox/mapbox-gl-draw` adapted for MapLibre) or is hand-built

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets

- **ADS-B Tracker REST API** at port 3002 (existing service, not modified in Phase 7):
  - `GET /api/swim/latest?bbox=latMin,lonMin,latMax,lonMax&minutes=5` — live positions from FAA SWIM
  - `GET /api/swim/tracks?bbox=...&minutes=30` — flight tracks
  - `GET /api/swim/stats` — feed statistics
  - `GET /api/airports?bbox=...` — FAA airport data
  - `GET /api/waypoints?bbox=...` — FAA waypoints
- **`ADSB_API_BASE_URL` env var** already in `.env.example` since Phase 1 (reserved for this phase)
- **`aircraft.tail_number`** column from Phase 2 — the key for matching school aircraft against ADS-B positions
- **Phase 3 `reservation.route_string / ete_minutes / stops[]`** — XC flight following overlay data
- **Phase 3 dispatch screen** — gets the "Fleet Map" deep-link per dispatched flight
- **Phase 3 `DispatchBoard.tsx`** — 15s polling pattern via TanStack Query (Phase 7 fleet map uses 5s instead)
- **`withTenantTx` middleware** — geofence CRUD goes through this
- **`adminProcedure` / `protectedProcedure`** — geofence admin is adminProcedure; map view is protectedProcedure
- **Audit trigger + RLS pattern** — geofence table follows standard Phase 1-6 schema treatment

### Established Patterns

- TanStack Query `refetchInterval` for live-updating views (Phase 3 dispatch: 15s)
- Server Components for page shells, `'use client'` for interactive widgets (all phases)
- `packages/domain/src/` for shared interfaces (AdsbProvider interface lives here)
- `packages/api/src/providers/` convention (new — AdsbProvider is the first "provider" in the API package; maintenance triggers and SQL functions were direct, this is the first external-service integration)

### Integration Points

- Phase 3 dispatch screen: add "Fleet Map" deep-link per dispatched flight row
- Phase 3 XC flight following: read reservation.route_string for planned route overlay
- Phase 4 aircraft.grounded_at: distinguish grounded aircraft on the map (red pin, no ADS-B expected)
- Phase 2 aircraft profile: "View last flight" link to replay route
- `(app)/layout.tsx` header: add "Fleet Map" nav link for all authenticated roles
- Phase 8 (future) will add server-side geofence checking for email/SMS alerts — Phase 7 is client-side only

</code_context>

<specifics>
## Specific Ideas

- The fleet map should feel like a real flight-tracking display — dark background, clean icons, aircraft trails fading behind them. Not a Google Maps vibe; more like FlightAware or FlightRadar24 but focused on the school's 5-10 aircraft with everything else dimmed
- School aircraft should be IMMEDIATELY visually distinct from traffic — the eye should go to your fleet first, always
- The geofence boundary should render as a subtle blue overlay (not a thick border) so it doesn't clutter the map but you can always see where the training area is
- XC flight following should show plan vs actual visually — dashed line for the planned route, solid line for the actual track. If the student deviates from the planned route, the visual gap is the alert itself
- Signal-lost state (>5 min no update) should feel concerning — a pulsing gray icon suggests "we lost this one, pay attention"
- The fleet sidebar list should sort airborne aircraft to the top (they're the ones you're watching), grounded at the bottom

</specifics>

<deferred>
## Deferred Ideas

- **Email/SMS geofence breach alerts** — Phase 8 (notifications)
- **Server-side geofence checking** (for when the dispatcher isn't looking at the map) — Phase 8
- **Weather overlay** (METAR/TAF on the map) — v2
- **Local ADS-B receiver ingestion (dump1090/PiAware)** — explicitly out of scope per PROJECT.md
- **Mobile fleet map** — v2 mobile pillar
- **Historical track replay beyond most-recent flight** — v2
- **Multi-school fleet map (SaaS view of all customers' aircraft)** — v2
- **Airspace overlay (Class B/C/D boundaries)** — v2 (data available from ADS-B Tracker's waypoints endpoint)
- **Aircraft icon customization per aircraft (upload a silhouette for each tail)** — v2
- **Real-time ETA calculation from ADS-B position to destination** — v2
- **Student-facing "where is my aircraft right now" widget on the reservation detail page** — could be a quick Phase 8 polish item
- **Map tile style switcher (dark/light/satellite)** — Phase 8 polish

</deferred>

---

_Phase: 07-adsb-fleet-integration_
_Context gathered: 2026-04-10_
