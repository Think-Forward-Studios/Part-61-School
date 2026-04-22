/**
 * In-memory rolling position cache for synthesized aircraft tracks.
 *
 * OpenSky has a /tracks endpoint but it's expensive (one call per
 * aircraft) and most of our fleet-map use is "show the trail of what's
 * been airborne in the last N minutes" — a rolling buffer of the
 * polled positions works for that. Every call to /api/adsb/swim/latest
 * appends the incoming positions into this cache; /api/adsb/swim/tracks
 * reads the cache and returns the last N points per icao24.
 *
 * CAVEAT: memory is per-lambda-instance. Across warm lambdas the cache
 * eventually converges since every instance accumulates from the same
 * upstream feed, but a cold start renders zero track points until the
 * first poll cycle has landed 2+ samples. Good enough for v1; a shared
 * Redis cache is the obvious upgrade if trail quality matters.
 */
import type { AircraftPosition } from '@part61/domain';

interface Point {
  lat: number;
  lon: number;
  alt: number | null;
  t: number; // unix seconds
}

interface Entry {
  icao24: string;
  callsign: string | null;
  acType: string | null;
  points: Point[];
}

const MAX_POINTS_PER_AC = 40; // ~3.3 min of trail at 5 s polling
const MAX_ENTRIES = 4_000; // cap lambda memory
const STALE_SECONDS = 600; // drop aircraft not seen in 10 min

const cache = new Map<string, Entry>();

export function ingest(positions: AircraftPosition[]): void {
  const now = Math.floor(Date.now() / 1000);
  for (const p of positions) {
    if (p.latitude == null || p.longitude == null) continue;
    let entry = cache.get(p.icao24);
    if (!entry) {
      entry = {
        icao24: p.icao24,
        callsign: p.callsign ?? null,
        acType: p.acType ?? null,
        points: [],
      };
      cache.set(p.icao24, entry);
    }
    entry.callsign = p.callsign ?? entry.callsign;
    entry.acType = p.acType ?? entry.acType;
    const last = entry.points[entry.points.length - 1];
    if (last && Math.abs(last.lat - p.latitude) < 1e-5 && Math.abs(last.lon - p.longitude) < 1e-5) {
      // Same position as last sample — update timestamp but don't
      // waste a slot on an identical point (parked or hovering).
      last.t = p.apiTime || now;
      continue;
    }
    entry.points.push({
      lat: p.latitude,
      lon: p.longitude,
      alt: p.baroAltitude ?? null,
      t: p.apiTime || now,
    });
    if (entry.points.length > MAX_POINTS_PER_AC) {
      entry.points.splice(0, entry.points.length - MAX_POINTS_PER_AC);
    }
  }
  // Drop stale aircraft so the cache doesn't grow unbounded.
  if (cache.size > MAX_ENTRIES) {
    const cutoff = now - STALE_SECONDS;
    for (const [key, entry] of cache) {
      const lastPoint = entry.points[entry.points.length - 1];
      if (!lastPoint || lastPoint.t < cutoff) cache.delete(key);
    }
  }
}

export interface CachedTrack {
  icao24: string;
  callsign: string | null;
  ac_type: string | null;
  lons: number[];
  lats: number[];
  alts: (number | null)[];
  point_count: number;
  first_seen: number;
  last_seen: number;
}

export function readTracks(bbox: {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}): CachedTrack[] {
  const out: CachedTrack[] = [];
  for (const entry of cache.values()) {
    if (entry.points.length < 2) continue; // need ≥2 points for a line
    const last = entry.points[entry.points.length - 1];
    if (!last) continue;
    if (
      last.lat < bbox.latMin ||
      last.lat > bbox.latMax ||
      last.lon < bbox.lonMin ||
      last.lon > bbox.lonMax
    ) {
      continue;
    }
    out.push({
      icao24: entry.icao24,
      callsign: entry.callsign,
      ac_type: entry.acType,
      lons: entry.points.map((p) => p.lon),
      lats: entry.points.map((p) => p.lat),
      alts: entry.points.map((p) => p.alt),
      point_count: entry.points.length,
      first_seen: entry.points[0]?.t ?? 0,
      last_seen: last.t,
    });
  }
  return out;
}
