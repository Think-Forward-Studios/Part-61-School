/**
 * GET /api/adsb/swim/stats
 *
 * Simple health signal for the HUD. Returns { data: FeedStats }.
 */
import { NextResponse } from 'next/server';
import { getAdsbProvider } from '../../_provider';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const provider = getAdsbProvider();
    const stats = await provider.getStats();
    return NextResponse.json({
      data: {
        total_positions: stats.totalPositions,
        unique_aircraft: stats.uniqueAircraft,
        earliest_time: stats.earliestTime,
        latest_time: stats.latestTime,
        identified_aircraft: stats.identifiedAircraft,
        with_callsign: stats.withCallsign,
      },
    });
  } catch (err) {
    console.error('[/api/adsb/swim/stats] failed:', err);
    return NextResponse.json(
      {
        data: {
          total_positions: 0,
          unique_aircraft: 0,
          earliest_time: 0,
          latest_time: 0,
          identified_aircraft: 0,
          with_callsign: 0,
        },
      },
      { status: 500 },
    );
  }
}
