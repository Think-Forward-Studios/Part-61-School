/**
 * AdsbFiProvider — REST client for the free adsb.fi open data API.
 *
 *   Base: https://opendata.adsb.fi/api/
 *   Docs: https://github.com/adsbfi/opendata
 *
 * No auth, no API key. Rate limit is 1 req/s per IP on public
 * endpoints. Our fleet map polls at 5 s cadence (2 queries/tick), so
 * we stay inside the limit.
 *
 * Implements the same AdsbProvider interface as SwimAdsbProvider so
 * the tRPC router can swap providers with one import change.
 *
 * Endpoint mapping:
 *   - Fleet / traffic   → GET /api/v3/lat/{lat}/lon/{lon}/dist/{nm}
 *     Our bbox gets reduced to (center lat/lon, radius-to-corner nm).
 *     Caps `dist` at 250 NM.
 *   - Flight tracks     → not supported by adsb.fi's open API.
 *   - Feed stats        → derived from a single traffic query.
 */
import type { AdsbProvider, AircraftPosition, BBox, FeedStats, TrackPoint } from '@part61/domain';
import { normalizeTail } from '@part61/domain';

// adsb.fi v2 aircraft shape (loose — we only use a handful of fields).
interface AdsbFiAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  baro_rate?: number;
  squawk?: string;
  seen_pos?: number;
}

interface AdsbFiResponse {
  now?: number; // milliseconds since epoch
  total?: number;
  ac?: AdsbFiAircraft[];
}

function haversineNm(latA: number, lonA: number, latB: number, lonB: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R_NM = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
  return R_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Convert an axis-aligned lat/lon bounding box into the tightest
 * circular query adsb.fi's `dist` endpoint accepts: the bbox center
 * and the great-circle distance from center to the farthest corner,
 * clamped to adsb.fi's 250 NM maximum.
 */
function bboxToCenterRadius(bbox: BBox): { lat: number; lon: number; distNm: number } {
  const lat = (bbox.latMin + bbox.latMax) / 2;
  const lon = (bbox.lonMin + bbox.lonMax) / 2;
  const cornerDist = Math.max(
    haversineNm(lat, lon, bbox.latMin, bbox.lonMin),
    haversineNm(lat, lon, bbox.latMin, bbox.lonMax),
    haversineNm(lat, lon, bbox.latMax, bbox.lonMin),
    haversineNm(lat, lon, bbox.latMax, bbox.lonMax),
  );
  const distNm = Math.min(250, Math.max(5, Math.ceil(cornerDist)));
  return { lat, lon, distNm };
}

function coerceCallsign(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function coerceBaroAltitude(raw: AdsbFiAircraft['alt_baro']): number | null {
  if (typeof raw === 'number') return raw;
  // 'ground' sentinel maps to null + onGround=true
  return null;
}

function toAircraftPosition(raw: AdsbFiAircraft, nowSeconds: number): AircraftPosition | null {
  if (typeof raw.lat !== 'number' || typeof raw.lon !== 'number') return null;
  if (!raw.hex) return null;
  return {
    icao24: raw.hex.toLowerCase(),
    callsign: coerceCallsign(raw.flight) ?? coerceCallsign(raw.r),
    latitude: raw.lat,
    longitude: raw.lon,
    baroAltitude: coerceBaroAltitude(raw.alt_baro),
    velocity: typeof raw.gs === 'number' ? raw.gs : null,
    trueTrack: typeof raw.track === 'number' ? raw.track : null,
    verticalRate: typeof raw.baro_rate === 'number' ? raw.baro_rate : null,
    onGround: raw.alt_baro === 'ground',
    squawk: typeof raw.squawk === 'string' ? raw.squawk : null,
    apiTime: nowSeconds,
    acType: typeof raw.t === 'string' ? raw.t : null,
    airport: null,
  };
}

export class AdsbFiProvider implements AdsbProvider {
  private readonly baseUrl: string;

  constructor(baseUrl: string = 'https://opendata.adsb.fi/api') {
    // Strip trailing slash; the endpoint paths add their own.
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async getFleetPositions(tailNumbers: string[], bbox: BBox): Promise<AircraftPosition[]> {
    if (tailNumbers.length === 0) return [];
    const all = await this.fetchTraffic(bbox);
    if (all.length === 0) return [];
    const normalizedTails = new Set(tailNumbers.map(normalizeTail));
    return all.filter((pos) => {
      if (!pos.callsign) return false;
      return normalizedTails.has(normalizeTail(pos.callsign));
    });
  }

  async getTrafficInBbox(bbox: BBox): Promise<AircraftPosition[]> {
    return this.fetchTraffic(bbox);
  }

  /**
   * adsb.fi doesn't expose a "historical track for callsign" endpoint.
   * Returns null; the fleet-map replay feature will need a separate
   * source (our own persistence of the per-tick feed) when we revisit.
   */
  async getFlightTrack(_callsign: string, _bbox: BBox): Promise<TrackPoint | null> {
    void _callsign;
    void _bbox;
    return null;
  }

  async getStats(): Promise<FeedStats> {
    // No stats endpoint; do a single broad query and derive a signal.
    try {
      const url = `${this.baseUrl}/v3/lat/39.8/lon/-98.5/dist/250`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) return this.emptyStats();
      const json = (await resp.json()) as AdsbFiResponse;
      const now = typeof json.now === 'number' ? Math.floor(json.now / 1000) : 0;
      const ac = json.ac ?? [];
      return {
        totalPositions: ac.length,
        uniqueAircraft: new Set(ac.map((a) => a.hex).filter(Boolean)).size,
        earliestTime: now,
        latestTime: now,
        identifiedAircraft: ac.filter((a) => a.hex).length,
        withCallsign: ac.filter((a) => coerceCallsign(a.flight) !== null).length,
      };
    } catch (err) {
      console.error('[AdsbFiProvider] Failed to fetch stats:', err);
      return this.emptyStats();
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async fetchTraffic(bbox: BBox): Promise<AircraftPosition[]> {
    const { lat, lon, distNm } = bboxToCenterRadius(bbox);
    try {
      const url = `${this.baseUrl}/v3/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${distNm}`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        // adsb.fi asks consumers to set a descriptive UA so they can
        // contact operators if something misbehaves (docs §Usage).
        headers: { 'User-Agent': 'part61-school-flight-app (contact: admin)' },
      });
      if (!resp.ok) {
        console.error(`[AdsbFiProvider] /dist endpoint returned ${resp.status}`);
        return [];
      }
      const json = (await resp.json()) as AdsbFiResponse;
      const nowSeconds =
        typeof json.now === 'number' ? Math.floor(json.now / 1000) : Math.floor(Date.now() / 1000);
      const ac = json.ac ?? [];
      const positions: AircraftPosition[] = [];
      for (const raw of ac) {
        const pos = toAircraftPosition(raw, nowSeconds);
        if (pos) positions.push(pos);
      }
      return positions;
    } catch (err) {
      console.error('[AdsbFiProvider] Failed to fetch traffic:', err);
      return [];
    }
  }

  private emptyStats(): FeedStats {
    return {
      totalPositions: 0,
      uniqueAircraft: 0,
      earliestTime: 0,
      latestTime: 0,
      identifiedAircraft: 0,
      withCallsign: 0,
    };
  }
}
