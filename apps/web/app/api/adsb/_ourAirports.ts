/**
 * OurAirports loader + bbox filter.
 *
 * Data source: https://ourairports.com/data/ (CC0, public domain).
 *   - airports.csv   — ~80k airports worldwide (heliports, small fields,
 *                      medium/large airports, closed, etc.)
 *   - navaids.csv    — VOR/DME/NDB/TACAN
 *
 * We fetch the CSVs on first request per lambda, parse them into
 * lean records, and cache in module memory. Subsequent requests in
 * the same warm lambda read from memory. Cold starts pay the ~2 MB
 * download cost once.
 *
 * OurAirports doesn't publish RNAV waypoints. For waypoints we leave
 * the layer empty — it only becomes visible at zoom ≥ 7 anyway, where
 * hobbyist flight planning would typically reach for FAA CIFP/NASR
 * data which isn't CC0. Future work: seed FAA NASR to our own DB.
 */
const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const NAVAIDS_URL = 'https://davidmegginson.github.io/ourairports-data/navaids.csv';

export interface AirportRecord {
  location_id: string;
  icao_id?: string;
  name: string;
  city?: string;
  state_code?: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  facility_use?: string;
  type: string;
}

export interface NavaidRecord {
  nav_id: string;
  nav_type: string;
  official_id?: string;
  city?: string;
  state_code?: string;
  latitude: number;
  longitude: number;
}

let airportsCache: AirportRecord[] | null = null;
let navaidsCache: NavaidRecord[] | null = null;
let airportsPromise: Promise<AirportRecord[]> | null = null;
let navaidsPromise: Promise<NavaidRecord[]> | null = null;

/**
 * Tiny CSV parser that handles the quoted-comma case from OurAirports.
 * Not general-purpose — good enough for their flat schema.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\r') {
        // skip — normalize CRLF
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function indexHeader(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    map[h.trim()] = i;
  });
  return map;
}

async function loadAirports(): Promise<AirportRecord[]> {
  if (airportsCache) return airportsCache;
  if (airportsPromise) return airportsPromise;
  airportsPromise = (async () => {
    const resp = await fetch(AIRPORTS_URL, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) throw new Error(`OurAirports airports returned ${resp.status}`);
    const text = await resp.text();
    const rows = parseCsv(text);
    const header = rows.shift();
    if (!header) return [];
    const idx = indexHeader(header);
    const out: AirportRecord[] = [];
    for (const r of rows) {
      const lat = Number(r[idx.latitude_deg ?? -1]);
      const lon = Number(r[idx.longitude_deg ?? -1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const type = (r[idx.type ?? -1] ?? '').trim();
      // Filter out closed airports — they're noisy and not useful.
      if (type === 'closed') continue;
      out.push({
        location_id: (r[idx.ident ?? -1] ?? '').trim(),
        icao_id: (r[idx.gps_code ?? -1] ?? '').trim() || undefined,
        name: (r[idx.name ?? -1] ?? '').trim(),
        city: (r[idx.municipality ?? -1] ?? '').trim() || undefined,
        state_code: (r[idx.iso_region ?? -1] ?? '').trim() || undefined,
        latitude: lat,
        longitude: lon,
        elevation: Number(r[idx.elevation_ft ?? -1]) || undefined,
        facility_use: (r[idx.scheduled_service ?? -1] ?? '').trim() || undefined,
        type,
      });
    }
    airportsCache = out;
    return out;
  })().finally(() => {
    airportsPromise = null;
  });
  return airportsPromise;
}

async function loadNavaids(): Promise<NavaidRecord[]> {
  if (navaidsCache) return navaidsCache;
  if (navaidsPromise) return navaidsPromise;
  navaidsPromise = (async () => {
    const resp = await fetch(NAVAIDS_URL, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) throw new Error(`OurAirports navaids returned ${resp.status}`);
    const text = await resp.text();
    const rows = parseCsv(text);
    const header = rows.shift();
    if (!header) return [];
    const idx = indexHeader(header);
    const out: NavaidRecord[] = [];
    for (const r of rows) {
      const lat = Number(r[idx.latitude_deg ?? -1]);
      const lon = Number(r[idx.longitude_deg ?? -1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({
        nav_id: (r[idx.filename ?? -1] ?? '').trim(),
        nav_type: (r[idx.type ?? -1] ?? '').trim(),
        official_id: (r[idx.ident ?? -1] ?? '').trim() || undefined,
        city: (r[idx.associated_airport ?? -1] ?? '').trim() || undefined,
        state_code: (r[idx.iso_country ?? -1] ?? '').trim() || undefined,
        latitude: lat,
        longitude: lon,
      });
    }
    navaidsCache = out;
    return out;
  })().finally(() => {
    navaidsPromise = null;
  });
  return navaidsPromise;
}

function inBbox(
  lat: number,
  lon: number,
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number },
): boolean {
  return lat >= bbox.latMin && lat <= bbox.latMax && lon >= bbox.lonMin && lon <= bbox.lonMax;
}

export async function airportsInBbox(
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number },
  limit = 2000,
): Promise<AirportRecord[]> {
  const all = await loadAirports();
  const out: AirportRecord[] = [];
  for (const a of all) {
    if (inBbox(a.latitude, a.longitude, bbox)) {
      out.push(a);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function navaidsInBbox(
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number },
  limit = 1000,
): Promise<NavaidRecord[]> {
  const all = await loadNavaids();
  const out: NavaidRecord[] = [];
  for (const n of all) {
    if (inBbox(n.latitude, n.longitude, bbox)) {
      out.push(n);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function searchAirports(q: string, limit = 25): Promise<AirportRecord[]> {
  const all = await loadAirports();
  const needle = q.trim().toLowerCase();
  if (needle.length === 0) return [];
  const out: AirportRecord[] = [];
  for (const a of all) {
    if (
      a.location_id.toLowerCase().includes(needle) ||
      a.icao_id?.toLowerCase().includes(needle) ||
      a.name.toLowerCase().includes(needle) ||
      a.city?.toLowerCase().includes(needle)
    ) {
      out.push(a);
      if (out.length >= limit) break;
    }
  }
  return out;
}
