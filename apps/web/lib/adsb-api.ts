// Default to same-origin /api/adsb — our Next.js app now proxies the
// ADS-B feed through its own API routes. NEXT_PUBLIC_ADSB_API_URL can
// still override when pointing at a dedicated tracker service (e.g.
// local dev with a standalone ADS-B Tracker on :3002).
const API_BASE = process.env.NEXT_PUBLIC_ADSB_API_URL || '/api/adsb';

export interface BBox {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}

export interface Waypoint {
  fix_id: string;
  latitude: number;
  longitude: number;
  type?: string;
}

export interface Airport {
  location_id: string;
  icao_id?: string;
  name: string;
  city?: string;
  state_code?: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  facility_use?: string;
}

export interface Navaid {
  nav_id: string;
  nav_type: string;
  official_id?: string;
  city?: string;
  state_code?: string;
  latitude: number;
  longitude: number;
}

export interface Airway {
  airway_id: string;
  sequence: number;
  fix_id: string;
  latitude: number;
  longitude: number;
}

export interface AircraftState {
  icao24: string;
  callsign?: string;
  origin_country?: string;
  longitude: number;
  latitude: number;
  baro_altitude?: number;
  velocity?: number;
  true_track?: number;
  on_ground?: boolean;
  geo_altitude?: number;
  squawk?: string;
  category?: number;
  api_time?: number;
  // Flight plan fields from TAIS
  ac_type?: string;
  airport?: string;
  entry_fix?: string;
  exit_fix?: string;
  flight_rules?: string;
  flight_type?: string;
  requested_altitude?: number;
  assigned_altitude?: number;
}

function bboxToQuery(bbox: BBox): string {
  return `bbox=${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax}`;
}

interface ApiResponse<T> {
  count: number;
  data: T[];
}

async function fetchJson<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const json: ApiResponse<T> = await res.json();
  return json.data;
}

export async function fetchWaypoints(bbox: BBox): Promise<Waypoint[]> {
  return fetchJson<Waypoint>(`${API_BASE}/waypoints?${bboxToQuery(bbox)}`);
}

export async function fetchAirports(bbox: BBox): Promise<Airport[]> {
  return fetchJson<Airport>(`${API_BASE}/airports?${bboxToQuery(bbox)}`);
}

export async function searchAirports(q: string): Promise<Airport[]> {
  return fetchJson<Airport>(`${API_BASE}/airports/search?q=${encodeURIComponent(q)}`);
}

export async function fetchNavaids(bbox: BBox): Promise<Navaid[]> {
  return fetchJson<Navaid>(`${API_BASE}/navaids?${bboxToQuery(bbox)}`);
}

export async function fetchAirways(bbox: BBox): Promise<Airway[]> {
  return fetchJson<Airway>(`${API_BASE}/airways?${bboxToQuery(bbox)}`);
}

export interface AircraftTrack {
  icao24: string;
  callsign?: string;
  lons: number[];
  lats: number[];
  alts: (number | null)[];
  point_count: number;
  first_seen: number;
  last_seen: number;
  avg_velocity?: number;
  max_altitude?: number;
  // Flight plan fields from TAIS
  ac_type?: string;
  airport?: string;
  entry_fix?: string;
  exit_fix?: string;
  flight_rules?: string;
  flight_type?: string;
  requested_altitude?: number;
  assigned_altitude?: number;
}

export async function fetchStates(
  bbox: BBox,
  timeStart?: number,
  timeEnd?: number,
): Promise<AircraftState[]> {
  let url = `${API_BASE}/states?${bboxToQuery(bbox)}`;
  if (timeStart) url += `&time_start=${timeStart}`;
  if (timeEnd) url += `&time_end=${timeEnd}`;
  return fetchJson<AircraftState>(url);
}

export async function fetchTracks(bbox: BBox): Promise<AircraftTrack[]> {
  return fetchJson<AircraftTrack>(`${API_BASE}/tracks?${bboxToQuery(bbox)}`);
}

// SWIM Live Data API

export async function fetchSwimLatest(bbox: BBox, minutes = 5): Promise<AircraftState[]> {
  return fetchJson<AircraftState>(
    `${API_BASE}/swim/latest?${bboxToQuery(bbox)}&minutes=${minutes}`,
  );
}

export async function fetchSwimTracks(bbox: BBox, minutes = 30): Promise<AircraftTrack[]> {
  return fetchJson<AircraftTrack>(
    `${API_BASE}/swim/tracks?${bboxToQuery(bbox)}&minutes=${minutes}`,
  );
}

export interface SwimStats {
  total_positions: number;
  unique_aircraft: number;
  earliest_time: number;
  latest_time: number;
  identified_aircraft: number;
  with_callsign: number;
}

export async function fetchSwimStats(): Promise<SwimStats> {
  const res = await fetch(`${API_BASE}/swim/stats`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.data;
}
