/**
 * OpenSkyAdsbProvider — REST client for the OpenSky Network v1 API.
 *
 *   https://openskynetwork.github.io/opensky-api/rest.html
 *
 * Authentication is OAuth2 client-credentials (the new system OpenSky
 * rolled out in 2024 — the old basic-auth endpoint still works but is
 * deprecated). Token endpoint:
 *
 *   POST https://auth.opensky-network.org/auth/realms/opensky-network/
 *        protocol/openid-connect/token
 *   grant_type=client_credentials
 *   client_id=<OPENSKY_CLIENT_ID>
 *   client_secret=<OPENSKY_CLIENT_SECRET>
 *
 * Returns a JWT access_token (expires_in ≈ 30 min). We cache tokens in
 * memory per lambda instance and refresh ~2 min before expiry.
 *
 * Rate-limit credits (OpenSky docs): anonymous 400/day, authenticated
 * 4,000/day (per-second bbox query costs 4 credits). We poll at 5 s
 * intervals with 2 queries/tick → ~23 credits/min → ~1,400 credits/hr.
 * A single active admin viewing the map would consume the daily quota
 * in ~3 hours, so for production we should add server-side caching,
 * but for now this is enough to prove the plumbing.
 *
 * UNITS: OpenSky reports altitudes in METERS and velocities in
 * METERS/SECOND. Our domain types match SWIM's expectation (altitude
 * in feet, velocity in knots) so we convert on the way in.
 */
import type { AdsbProvider, AircraftPosition, BBox, FeedStats, TrackPoint } from '@part61/domain';
import { normalizeTail } from '@part61/domain';

const OPENSKY_AUTH_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const OPENSKY_API_BASE = 'https://opensky-network.org/api';

const M_TO_FT = 3.28084;
const MPS_TO_KT = 1.94384;
const MPS_TO_FPM = 196.85;

type OpenSkyState = [
  icao24: string,
  callsign: string | null,
  originCountry: string,
  timePosition: number | null,
  lastContact: number,
  longitude: number | null,
  latitude: number | null,
  baroAltitude: number | null,
  onGround: boolean,
  velocity: number | null,
  trueTrack: number | null,
  verticalRate: number | null,
  sensors: number[] | null,
  geoAltitude: number | null,
  squawk: string | null,
  spi: boolean,
  positionSource: number,
];

interface OpenSkyAllResponse {
  time: number;
  states: OpenSkyState[] | null;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // ms since epoch
}

function mapState(s: OpenSkyState): AircraftPosition | null {
  const [
    icao24,
    callsignRaw,
    ,
    timePosition,
    lastContact,
    longitude,
    latitude,
    baroAltitudeM,
    onGround,
    velocityMps,
    trueTrack,
    verticalRateMps,
    ,
    ,
    squawk,
  ] = s;
  if (latitude == null || longitude == null || !icao24) return null;
  const callsign = callsignRaw ? callsignRaw.trim() : null;
  return {
    icao24: icao24.toLowerCase(),
    callsign: callsign && callsign.length > 0 ? callsign : null,
    latitude,
    longitude,
    baroAltitude: baroAltitudeM != null ? Math.round(baroAltitudeM * M_TO_FT) : null,
    velocity: velocityMps != null ? Math.round(velocityMps * MPS_TO_KT) : null,
    trueTrack: trueTrack ?? null,
    verticalRate: verticalRateMps != null ? Math.round(verticalRateMps * MPS_TO_FPM) : null,
    onGround,
    squawk: squawk ?? null,
    apiTime: timePosition ?? lastContact,
    acType: null, // OpenSky doesn't return aircraft type in /states/all
    airport: null,
  };
}

// Short-lived cache keyed by bbox so a burst of polls (multiple tabs,
// multiple roles viewing /fleet-map) all get served from one upstream
// request. OpenSky /states/all typically takes 3-8s to respond; a 4s
// cache means each Vercel lambda hits OpenSky at most once per window.
interface CachedBbox {
  key: string;
  at: number; // ms
  positions: AircraftPosition[];
}
const BBOX_TTL_MS = 4_000;
const bboxCache = new Map<string, CachedBbox>();
const pendingBbox = new Map<string, Promise<AircraftPosition[]>>();

function bboxKey(b: BBox): string {
  // Round to 2 decimal places so near-identical bboxes share a cache
  // slot (fleet-map adjusts bbox on every map-move).
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(b.latMin)},${r(b.lonMin)},${r(b.latMax)},${r(b.lonMax)}`;
}

export class OpenSkyAdsbProvider implements AdsbProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private token: CachedToken | null = null;
  private pendingToken: Promise<CachedToken> | null = null;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getFleetPositions(tailNumbers: string[], bbox: BBox): Promise<AircraftPosition[]> {
    if (tailNumbers.length === 0) return [];
    const all = await this.fetchStates(bbox);
    if (all.length === 0) return [];
    const normalizedTails = new Set(tailNumbers.map(normalizeTail));
    return all.filter((pos) => {
      if (!pos.callsign) return false;
      return normalizedTails.has(normalizeTail(pos.callsign));
    });
  }

  async getTrafficInBbox(bbox: BBox): Promise<AircraftPosition[]> {
    return this.fetchStates(bbox);
  }

  /**
   * OpenSky /tracks exists but requires the aircraft's icao24 (not
   * callsign) and only returns the last flight. Leaving unsupported
   * for now — our replay feature will likely persist the per-tick
   * feed instead of relying on the provider.
   */
  async getFlightTrack(_callsign: string, _bbox: BBox): Promise<TrackPoint | null> {
    void _callsign;
    void _bbox;
    return null;
  }

  async getStats(): Promise<FeedStats> {
    try {
      const token = await this.getToken();
      const resp = await fetch(`${OPENSKY_API_BASE}/states/all`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      if (!resp.ok) return this.emptyStats();
      const json = (await resp.json()) as OpenSkyAllResponse;
      const states = json.states ?? [];
      const now = json.time;
      const withCs = states.filter((s) => s[1] && s[1].trim().length > 0).length;
      return {
        totalPositions: states.length,
        uniqueAircraft: new Set(states.map((s) => s[0])).size,
        earliestTime: now,
        latestTime: now,
        identifiedAircraft: states.length,
        withCallsign: withCs,
      };
    } catch (err) {
      console.error('[OpenSkyAdsbProvider] Failed to fetch stats:', err);
      return this.emptyStats();
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async fetchStates(bbox: BBox): Promise<AircraftPosition[]> {
    const key = bboxKey(bbox);
    const now = Date.now();
    const hit = bboxCache.get(key);
    if (hit && now - hit.at < BBOX_TTL_MS) {
      return hit.positions;
    }
    // Deduplicate concurrent fetches for the same bbox window.
    const pending = pendingBbox.get(key);
    if (pending) return pending;
    const p = this.fetchStatesUncached(bbox)
      .then((positions) => {
        bboxCache.set(key, { key, at: Date.now(), positions });
        // Cap cache size.
        if (bboxCache.size > 64) {
          const first = bboxCache.keys().next().value;
          if (first) bboxCache.delete(first);
        }
        return positions;
      })
      .finally(() => {
        pendingBbox.delete(key);
      });
    pendingBbox.set(key, p);
    return p;
  }

  private async fetchStatesUncached(bbox: BBox): Promise<AircraftPosition[]> {
    const params = new URLSearchParams({
      lamin: bbox.latMin.toString(),
      lomin: bbox.lonMin.toString(),
      lamax: bbox.latMax.toString(),
      lomax: bbox.lonMax.toString(),
    });
    // OpenSky /states/all commonly takes 5-12s. Vercel Pro lambdas
    // allow up to 60s by default; Hobby caps at 10s. Stick to 20s
    // here — if the fetch aborts, the caller silently falls back to
    // an empty feed (which the UI already handles).
    const STATES_TIMEOUT_MS = 20_000;
    try {
      const token = await this.getToken();
      const resp = await fetch(`${OPENSKY_API_BASE}/states/all?${params}`, {
        signal: AbortSignal.timeout(STATES_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      if (resp.status === 401) {
        this.token = null;
        const retryToken = await this.getToken();
        const retry = await fetch(`${OPENSKY_API_BASE}/states/all?${params}`, {
          signal: AbortSignal.timeout(STATES_TIMEOUT_MS),
          headers: { Authorization: `Bearer ${retryToken.accessToken}` },
        });
        if (!retry.ok) {
          console.error(`[OpenSkyAdsbProvider] states/all retried → ${retry.status}`);
          return [];
        }
        return this.parseStates(await retry.json());
      }
      if (!resp.ok) {
        console.error(`[OpenSkyAdsbProvider] states/all returned ${resp.status}`);
        return [];
      }
      return this.parseStates(await resp.json());
    } catch (err) {
      console.error('[OpenSkyAdsbProvider] Failed to fetch states:', err);
      return [];
    }
  }

  private parseStates(json: unknown): AircraftPosition[] {
    const typed = json as OpenSkyAllResponse | null;
    const states = typed?.states ?? [];
    const out: AircraftPosition[] = [];
    for (const s of states) {
      const pos = mapState(s);
      if (pos) out.push(pos);
    }
    return out;
  }

  private async getToken(): Promise<CachedToken> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 60_000) return this.token;
    // Deduplicate concurrent token refreshes so we don't burn credits.
    if (this.pendingToken) return this.pendingToken;
    this.pendingToken = this.fetchToken().finally(() => {
      this.pendingToken = null;
    });
    this.token = await this.pendingToken;
    return this.token;
  }

  private async fetchToken(): Promise<CachedToken> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const resp = await fetch(OPENSKY_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      throw new Error(`OpenSky token endpoint returned ${resp.status}`);
    }
    const json = (await resp.json()) as { access_token: string; expires_in: number };
    return {
      accessToken: json.access_token,
      // Refresh ~2 min before expiry as a safety margin.
      expiresAt: Date.now() + Math.max(30, json.expires_in - 120) * 1000,
    };
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
