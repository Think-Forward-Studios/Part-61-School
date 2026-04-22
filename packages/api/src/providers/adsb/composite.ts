/**
 * CompositeAdsbProvider — tries a primary provider first, falls back
 * to a secondary on empty/failed response within the same request.
 *
 * Motivation: OpenSky's /states/all is fast in most networks but from
 * some Vercel lambda regions the end-to-end latency (cold start + OAuth
 * token + API call) blows past our abort timeout. adsb.fi is no-auth
 * and fast; if OpenSky returns nothing we try adsb.fi so the UI keeps
 * working.
 *
 * The primary's empty-result is treated the same as a thrown error
 * for fallback purposes — OpenSky returns `states: []` on rate-limit
 * or credit exhaustion rather than a non-2xx status, so we can't tell
 * "no aircraft in this bbox" from "auth rejected" at the response
 * level. The secondary being identical for "no aircraft" is the cost.
 */
import type { AdsbProvider, AircraftPosition, BBox, FeedStats, TrackPoint } from '@part61/domain';

export class CompositeAdsbProvider implements AdsbProvider {
  constructor(
    private readonly primary: AdsbProvider,
    private readonly secondary: AdsbProvider,
    private readonly label: string = 'composite',
  ) {}

  async getFleetPositions(tails: string[], bbox: BBox): Promise<AircraftPosition[]> {
    try {
      const p = await this.primary.getFleetPositions(tails, bbox);
      if (p.length > 0) return p;
      const s = await this.secondary.getFleetPositions(tails, bbox);
      return s;
    } catch (err) {
      console.error(`[${this.label}] primary getFleetPositions failed, falling back:`, err);
      return this.secondary.getFleetPositions(tails, bbox);
    }
  }

  async getTrafficInBbox(bbox: BBox): Promise<AircraftPosition[]> {
    try {
      const p = await this.primary.getTrafficInBbox(bbox);
      if (p.length > 0) return p;
      console.warn(`[${this.label}] primary returned 0 aircraft; trying secondary`);
      return this.secondary.getTrafficInBbox(bbox);
    } catch (err) {
      console.error(`[${this.label}] primary getTrafficInBbox failed, falling back:`, err);
      return this.secondary.getTrafficInBbox(bbox);
    }
  }

  async getFlightTrack(callsign: string, bbox: BBox): Promise<TrackPoint | null> {
    try {
      const p = await this.primary.getFlightTrack(callsign, bbox);
      if (p) return p;
      return this.secondary.getFlightTrack(callsign, bbox);
    } catch {
      return this.secondary.getFlightTrack(callsign, bbox);
    }
  }

  async getStats(): Promise<FeedStats> {
    try {
      return await this.primary.getStats();
    } catch {
      return this.secondary.getStats();
    }
  }
}
