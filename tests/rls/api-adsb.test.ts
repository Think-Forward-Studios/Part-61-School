/**
 * API integration tests for adsb + admin.geofence routers.
 *
 * Mocks global `fetch` to simulate ADS-B Tracker responses since the
 * Tracker service is not guaranteed to be running during tests.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
  SCHOOL_A,
  BASE_A,
  USER_A,
} from './harness';
import { adminCaller } from './api-caller';

let seed: SeedResult;
let aircraftId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();

  // Create a test aircraft for fleet position matching
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);
  const rows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft
      (school_id, base_id, tail_number, make, model)
    values
      ('${SCHOOL_A}', '${BASE_A}', 'N12345', 'Cessna', '172S')
    returning id
  `);
  aircraftId = rows[0]!.id;

  // Update base with lat/lon for flightTrack bbox calculation
  await sql.unsafe(`
    update public.bases
       set latitude = 32.85, longitude = -97.05
     where id = '${BASE_A}'
  `);

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

// -----------------------------------------------------------------------
// ADS-B router tests (with mocked fetch)
// -----------------------------------------------------------------------
describe('adsb router', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Mock fetch to return canned Tracker responses
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = typeof url === 'string' ? url : String(url);

      if (urlStr.includes('/api/swim/latest')) {
        return new Response(
          JSON.stringify({
            count: 2,
            data: [
              {
                icao24: 'a0b1c2',
                callsign: 'N12345',
                latitude: 32.9,
                longitude: -97.0,
                baro_altitude: 1500,
                velocity: 60,
                true_track: 180,
                vertical_rate: 0,
                on_ground: false,
                squawk: '1200',
                api_time: Date.now() / 1000,
                ac_type: 'C172',
                airport: null,
              },
              {
                icao24: 'f0e1d2',
                callsign: 'UAL123',
                latitude: 32.8,
                longitude: -97.1,
                baro_altitude: 35000,
                velocity: 250,
                true_track: 90,
                vertical_rate: 0,
                on_ground: false,
                squawk: '4567',
                api_time: Date.now() / 1000,
                ac_type: 'B738',
                airport: 'KDFW',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/api/swim/tracks')) {
        return new Response(
          JSON.stringify({
            count: 1,
            data: [
              {
                icao24: 'a0b1c2',
                callsign: 'N12345',
                lons: [-97.0, -97.05, -97.1],
                lats: [32.9, 32.95, 33.0],
                alts: [1500, 2000, 2500],
                point_count: 3,
                first_seen: Date.now() / 1000 - 3600,
                last_seen: Date.now() / 1000,
                avg_velocity: 55,
                max_altitude: 2500,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/api/swim/stats')) {
        return new Response(
          JSON.stringify({
            data: {
              total_positions: 50000,
              unique_aircraft: 200,
              earliest_time: Date.now() / 1000 - 3600,
              latest_time: Date.now() / 1000,
              identified_aircraft: 150,
              with_callsign: 120,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Fallback: not found
      return new Response('Not Found', { status: 404 });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fleetPositions returns enriched positions with aircraftId and isGrounded', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.adsb.fleetPositions({
      bbox: { latMin: 32, lonMin: -98, latMax: 34, lonMax: -96 },
    });
    expect(result.fleet.length).toBeGreaterThanOrEqual(1);
    const schoolPlane = result.fleet.find((f) => f.tailNumber === 'N12345');
    expect(schoolPlane).toBeDefined();
    expect(schoolPlane!.aircraftId).toBe(aircraftId);
    expect(schoolPlane!.isGrounded).toBe(false);
    expect(result.feedHealthy).toBe(true);
  });

  it('traffic returns raw positions', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.adsb.traffic({
      bbox: { latMin: 32, lonMin: -98, latMax: 34, lonMax: -96 },
    });
    expect(result.traffic.length).toBe(2);
    expect(result.traffic[0]!.icao24).toBeDefined();
  });

  it('flightTrack returns track data when match found', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.adsb.flightTrack({
      tailNumber: 'N12345',
    });
    expect(result.track).not.toBeNull();
    expect(result.track!.pointCount).toBe(3);
    expect(result.track!.lons).toHaveLength(3);
  });

  it('flightTrack returns null when no match', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.adsb.flightTrack({
      tailNumber: 'N99999',
    });
    expect(result.track).toBeNull();
  });

  it('feedStats returns stats from Tracker', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.adsb.feedStats();
    expect(result.totalPositions).toBe(50000);
    expect(result.uniqueAircraft).toBe(200);
  });
});

// -----------------------------------------------------------------------
// admin.geofence router tests
// -----------------------------------------------------------------------
describe('admin.geofence router', () => {
  it('upsert creates a polygon geofence, getActive returns it', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const created = await caller.admin.geofence.upsert({
      baseId: seed.baseA,
      kind: 'polygon',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-97.0, 32.0],
            [-97.0, 33.0],
            [-96.0, 33.0],
            [-96.0, 32.0],
            [-97.0, 32.0],
          ],
        ],
      },
      label: 'Test Training Area',
    });
    expect(created.kind).toBe('polygon');
    expect(created.label).toBe('Test Training Area');
    expect(created.schoolId).toBe(seed.schoolA);

    const active = await caller.admin.geofence.getActive();
    expect(active).not.toBeNull();
    expect(active!.id).toBe(created.id);
  });

  it('upsert soft-deletes old geofence when replacing', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });

    // Create replacement
    const replacement = await caller.admin.geofence.upsert({
      baseId: seed.baseA,
      kind: 'circle',
      geometry: { type: 'Point', coordinates: [-97.0, 32.5] },
      radiusNm: 15,
      label: 'Circle Area',
    });
    expect(replacement.kind).toBe('circle');

    // Active should now be the replacement
    const active = await caller.admin.geofence.getActive();
    expect(active).not.toBeNull();
    expect(active!.id).toBe(replacement.id);
    expect(active!.kind).toBe('circle');
  });

  it('softDelete sets deleted_at', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });

    // Get the active geofence
    const active = await caller.admin.geofence.getActive();
    expect(active).not.toBeNull();

    // Soft delete it
    const result = await caller.admin.geofence.softDelete({ id: active!.id });
    expect(result.success).toBe(true);

    // getActive should now return null
    const afterDelete = await caller.admin.geofence.getActive();
    expect(afterDelete).toBeNull();
  });
});
