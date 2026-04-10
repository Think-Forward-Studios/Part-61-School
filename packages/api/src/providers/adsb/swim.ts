/**
 * SwimAdsbProvider — REST client for the ADS-B Tracker service.
 *
 * Calls the Tracker's SWIM endpoints to fetch live aircraft positions,
 * flight tracks, and feed statistics. The Tracker service may not be
 * running; all methods handle fetch errors gracefully, returning empty
 * arrays / null / zeros and logging the error.
 *
 * @see 07-RESEARCH.md Pattern 3: AdsbProvider Abstraction
 */
import type { AdsbProvider, AircraftPosition, BBox, FeedStats, TrackPoint } from '@part61/domain';
import {
  normalizeTail,
  swimLatestResponseSchema,
  swimStatsResponseSchema,
  swimTracksResponseSchema,
  toAircraftPosition,
  toFeedStats,
  toTrackPoint,
} from '@part61/domain';

function bboxToParam(bbox: BBox): string {
  return `${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax}`;
}

export class SwimAdsbProvider implements AdsbProvider {
  private readonly baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3002') {
    // Strip trailing slash for consistency
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async getFleetPositions(
    tailNumbers: string[],
    bbox: BBox,
    minutes = 5,
  ): Promise<AircraftPosition[]> {
    const allPositions = await this.fetchLatest(bbox, minutes);
    if (allPositions.length === 0 || tailNumbers.length === 0) return [];

    const normalizedTails = new Set(tailNumbers.map(normalizeTail));

    return allPositions.filter((pos) => {
      if (!pos.callsign) return false;
      const normalizedCallsign = normalizeTail(pos.callsign);
      return normalizedTails.has(normalizedCallsign);
    });
  }

  async getTrafficInBbox(bbox: BBox, minutes = 5): Promise<AircraftPosition[]> {
    return this.fetchLatest(bbox, minutes);
  }

  async getFlightTrack(callsign: string, bbox: BBox, minutes = 30): Promise<TrackPoint | null> {
    try {
      const url = `${this.baseUrl}/api/swim/tracks?bbox=${bboxToParam(bbox)}&minutes=${minutes}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) {
        console.error(`[SwimAdsbProvider] tracks endpoint returned ${resp.status}`);
        return null;
      }
      const json: unknown = await resp.json();
      const parsed = swimTracksResponseSchema.parse(json);
      const normalized = normalizeTail(callsign);
      const match = parsed.data.find((t) => {
        if (!t.callsign) return false;
        return normalizeTail(t.callsign) === normalized;
      });
      return match ? toTrackPoint(match) : null;
    } catch (err) {
      console.error('[SwimAdsbProvider] Failed to fetch tracks:', err);
      return null;
    }
  }

  async getStats(): Promise<FeedStats> {
    try {
      const url = `${this.baseUrl}/api/swim/stats`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) {
        console.error(`[SwimAdsbProvider] stats endpoint returned ${resp.status}`);
        return this.emptyStats();
      }
      const json: unknown = await resp.json();
      const parsed = swimStatsResponseSchema.parse(json);
      return toFeedStats(parsed.data);
    } catch (err) {
      console.error('[SwimAdsbProvider] Failed to fetch stats:', err);
      return this.emptyStats();
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async fetchLatest(bbox: BBox, minutes: number): Promise<AircraftPosition[]> {
    try {
      const url = `${this.baseUrl}/api/swim/latest?bbox=${bboxToParam(bbox)}&minutes=${minutes}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) {
        console.error(`[SwimAdsbProvider] latest endpoint returned ${resp.status}`);
        return [];
      }
      const json: unknown = await resp.json();
      const parsed = swimLatestResponseSchema.parse(json);
      return parsed.data.map(toAircraftPosition);
    } catch (err) {
      console.error('[SwimAdsbProvider] Failed to fetch latest:', err);
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
