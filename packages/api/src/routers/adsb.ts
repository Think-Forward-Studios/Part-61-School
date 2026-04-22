/**
 * adsb router (ADS-01, ADS-02, ADS-03, ADS-06, ADS-07).
 *
 * All authenticated roles can query the fleet map. Procedures call the
 * SwimAdsbProvider to fetch live data from the ADS-B Tracker service.
 */
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { aircraft, bases } from '@part61/db';
import type { BBox } from '@part61/domain';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';
import { AdsbFiProvider, OpenSkyAdsbProvider, SwimAdsbProvider } from '../providers/adsb';
import type { AdsbProvider } from '@part61/domain';

type Tx = {
  select: typeof import('@part61/db').db.select;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

/**
 * Choose the ADS-B feed provider based on env.
 *
 *   ADSB_PROVIDER=opensky   — OpenSky Network REST API with OAuth2.
 *                             Requires OPENSKY_CLIENT_ID +
 *                             OPENSKY_CLIENT_SECRET. Auto-selected
 *                             when those are set.
 *   ADSB_PROVIDER=adsbfi    — Free public REST at api.adsb.fi, no auth.
 *                             Used as the fallback when OpenSky
 *                             credentials aren't configured.
 *   ADSB_PROVIDER=swim      — Self-hosted tracker at ADSB_API_BASE_URL.
 *
 * All three implement the same AdsbProvider interface; the rest of the
 * router doesn't care which one is selected.
 */
function buildProvider(): AdsbProvider {
  const explicit = (process.env.ADSB_PROVIDER ?? '').toLowerCase();
  const openskyId = process.env.OPENSKY_CLIENT_ID;
  const openskySecret = process.env.OPENSKY_CLIENT_SECRET;
  const hasOpenSky = !!(openskyId && openskySecret);

  if (explicit === 'swim') {
    return new SwimAdsbProvider(process.env.ADSB_API_BASE_URL ?? 'http://localhost:3002');
  }
  if (explicit === 'adsbfi') {
    return new AdsbFiProvider(process.env.ADSB_API_BASE_URL ?? 'https://api.adsb.fi/v2');
  }
  if (explicit === 'opensky' || (explicit === '' && hasOpenSky)) {
    if (!hasOpenSky) {
      console.warn('[adsb] OPENSKY_CLIENT_ID/SECRET missing; falling back to adsb.fi');
      return new AdsbFiProvider();
    }
    return new OpenSkyAdsbProvider(openskyId!, openskySecret!);
  }
  // Default when nothing is configured: the no-auth public feed.
  return new AdsbFiProvider();
}

const provider: AdsbProvider = buildProvider();

const bboxInput = z.object({
  bbox: z.object({
    latMin: z.number(),
    lonMin: z.number(),
    latMax: z.number(),
    lonMax: z.number(),
  }),
});

export const adsbRouter = router({
  /**
   * Fleet positions: enriched with aircraft metadata.
   */
  fleetPositions: protectedProcedure.input(bboxInput).query(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const bbox: BBox = input.bbox;

    // Fetch all school aircraft (non-deleted)
    const allAircraft = await tx
      .select()
      .from(aircraft)
      .where(eq(aircraft.schoolId, ctx.session!.schoolId));
    const activeAircraft = allAircraft.filter((a) => !a.deletedAt);

    const tailNumbers = activeAircraft.map((a) => a.tailNumber);
    const positions = await provider.getFleetPositions(tailNumbers, bbox);

    // Build a lookup by normalized tail
    const aircraftByNormalizedTail = new Map<string, (typeof activeAircraft)[number]>();
    for (const a of activeAircraft) {
      const normalized = a.tailNumber.trim().toUpperCase().replace(/^N/, '');
      aircraftByNormalizedTail.set(normalized, a);
    }

    // Check for active reservations per aircraft
    const reservationRows = (await tx.execute(sql`
        select r.aircraft_id, r.id as reservation_id
          from public.reservation r
         where r.school_id = ${ctx.session!.schoolId}::uuid
           and r.status in ('dispatched', 'approved')
           and r.deleted_at is null
      `)) as unknown as Array<{
      aircraft_id: string;
      reservation_id: string;
    }>;
    const activeReservationByAircraftId = new Map<string, string>();
    for (const row of reservationRows) {
      activeReservationByAircraftId.set(row.aircraft_id, row.reservation_id);
    }

    const fleet = positions.map((pos) => {
      const normalizedCallsign = pos.callsign
        ? pos.callsign.trim().toUpperCase().replace(/^N/, '')
        : '';
      const ac = aircraftByNormalizedTail.get(normalizedCallsign);
      return {
        ...pos,
        aircraftId: ac?.id ?? null,
        tailNumber: ac?.tailNumber ?? pos.callsign,
        isGrounded: ac?.groundedAt != null,
        activeReservationId: ac ? (activeReservationByAircraftId.get(ac.id) ?? null) : null,
      };
    });

    // Feed health: if we got positions the feed is alive
    const feedHealthy = positions.length > 0 || tailNumbers.length === 0;

    return { fleet, feedHealthy };
  }),

  /**
   * Traffic: all aircraft in bbox (for the traffic layer).
   */
  traffic: protectedProcedure.input(bboxInput).query(async ({ input }) => {
    const traffic = await provider.getTrafficInBbox(input.bbox);
    return { traffic };
  }),

  /**
   * Flight track for a specific tail number.
   */
  flightTrack: protectedProcedure
    .input(
      z.object({
        tailNumber: z.string().min(1),
        minutes: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;

      // Get base lat/lon for bbox calculation
      const baseRows = await tx
        .select()
        .from(bases)
        .where(eq(bases.schoolId, ctx.session!.schoolId));
      const activeBase = baseRows.find(
        (b) => !b.deletedAt && b.latitude != null && b.longitude != null,
      );

      // Default bbox: generous 200nm (~3.3 degrees) padding from base
      const padding = 3.3;
      const bbox: BBox =
        activeBase?.latitude != null && activeBase?.longitude != null
          ? {
              latMin: activeBase.latitude - padding,
              lonMin: activeBase.longitude - padding,
              latMax: activeBase.latitude + padding,
              lonMax: activeBase.longitude + padding,
            }
          : { latMin: 24, lonMin: -125, latMax: 50, lonMax: -66 }; // CONUS fallback

      const track = await provider.getFlightTrack(input.tailNumber, bbox, input.minutes ?? 120);

      // Look up active reservation for planned route overlay
      let plannedRoute: string | null = null;
      const routeRows = (await tx.execute(sql`
        select r.route_string
          from public.reservation r
          join public.aircraft a on a.id = r.aircraft_id
         where r.school_id = ${ctx.session!.schoolId}::uuid
           and a.tail_number = ${input.tailNumber}
           and r.status in ('dispatched', 'approved')
           and r.deleted_at is null
         order by r.requested_at desc
         limit 1
      `)) as unknown as Array<{ route_string: string | null }>;
      if (routeRows[0]?.route_string) {
        plannedRoute = routeRows[0].route_string;
      }

      return { track, plannedRoute };
    }),

  /**
   * Feed statistics from the ADS-B Tracker.
   */
  feedStats: protectedProcedure.query(async () => {
    return provider.getStats();
  }),
});
