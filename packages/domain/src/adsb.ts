/**
 * ADS-B domain types (ADS-01, ADS-07).
 *
 * Defines the AdsbProvider interface consumed by tRPC routers, plus all
 * supporting types: BBox, AircraftPosition, TrackPoint, FeedStats.
 *
 * Zod schemas validate the snake_case responses from the ADS-B Tracker
 * REST API so errors are caught at the boundary, not deep inside the
 * application.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Domain types (camelCase)
// ---------------------------------------------------------------------------

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
  baroAltitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
  apiTime: number; // unix epoch seconds
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

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Zod schemas for Tracker REST API responses (snake_case)
// ---------------------------------------------------------------------------

const swimPositionSchema = z.object({
  icao24: z.string(),
  callsign: z.string().nullable().optional(),
  latitude: z.number(),
  longitude: z.number(),
  baro_altitude: z.number().nullable().optional(),
  velocity: z.number().nullable().optional(),
  true_track: z.number().nullable().optional(),
  vertical_rate: z.number().nullable().optional(),
  on_ground: z.boolean().optional(),
  squawk: z.string().nullable().optional(),
  api_time: z.number(),
  ac_type: z.string().nullable().optional(),
  airport: z.string().nullable().optional(),
});

export const swimLatestResponseSchema = z.object({
  count: z.number(),
  data: z.array(swimPositionSchema),
});

const swimTrackSchema = z.object({
  icao24: z.string(),
  callsign: z.string().nullable().optional(),
  lons: z.array(z.number()),
  lats: z.array(z.number()),
  alts: z.array(z.number().nullable()),
  point_count: z.number(),
  first_seen: z.number(),
  last_seen: z.number(),
  avg_velocity: z.number().nullable().optional(),
  max_altitude: z.number().nullable().optional(),
});

export const swimTracksResponseSchema = z.object({
  count: z.number(),
  data: z.array(swimTrackSchema),
});

const swimStatsDataSchema = z.object({
  total_positions: z.number(),
  unique_aircraft: z.number(),
  earliest_time: z.number(),
  latest_time: z.number(),
  identified_aircraft: z.number(),
  with_callsign: z.number(),
});

export const swimStatsResponseSchema = z.object({
  data: swimStatsDataSchema,
});

// ---------------------------------------------------------------------------
// Helpers: convert snake_case API data -> camelCase domain types
// ---------------------------------------------------------------------------

export function toAircraftPosition(raw: z.infer<typeof swimPositionSchema>): AircraftPosition {
  return {
    icao24: raw.icao24,
    callsign: raw.callsign ?? null,
    latitude: raw.latitude,
    longitude: raw.longitude,
    baroAltitude: raw.baro_altitude ?? null,
    velocity: raw.velocity ?? null,
    trueTrack: raw.true_track ?? null,
    verticalRate: raw.vertical_rate ?? null,
    onGround: raw.on_ground ?? false,
    squawk: raw.squawk ?? null,
    apiTime: raw.api_time,
    acType: raw.ac_type ?? null,
    airport: raw.airport ?? null,
  };
}

export function toTrackPoint(raw: z.infer<typeof swimTrackSchema>): TrackPoint {
  return {
    icao24: raw.icao24,
    callsign: raw.callsign ?? null,
    lons: raw.lons,
    lats: raw.lats,
    alts: raw.alts,
    pointCount: raw.point_count,
    firstSeen: raw.first_seen,
    lastSeen: raw.last_seen,
    avgVelocity: raw.avg_velocity ?? null,
    maxAltitude: raw.max_altitude ?? null,
  };
}

export function toFeedStats(raw: z.infer<typeof swimStatsDataSchema>): FeedStats {
  return {
    totalPositions: raw.total_positions,
    uniqueAircraft: raw.unique_aircraft,
    earliestTime: raw.earliest_time,
    latestTime: raw.latest_time,
    identifiedAircraft: raw.identified_aircraft,
    withCallsign: raw.with_callsign,
  };
}

/**
 * Normalize a tail number for ADS-B callsign matching.
 * Trim whitespace, uppercase, strip leading "N" so that e.g.
 * "N12345" matches callsign "12345" or "N12345  ".
 */
export function normalizeTail(tail: string): string {
  return tail.trim().toUpperCase().replace(/^N/, '');
}
