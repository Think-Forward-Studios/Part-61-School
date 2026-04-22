/**
 * GET /api/adsb/states?bbox=latMin,lonMin,latMax,lonMax
 *
 * Raw ADS-B positions feed. Same underlying source as /swim/latest
 * for our purposes — the LiveMapView client unions the two and
 * de-duplicates by icao24, so serving both from the same provider
 * is fine.
 */
import { NextResponse } from 'next/server';
import type { AircraftPosition } from '@part61/domain';
import { getAdsbProvider, parseBbox } from '../_provider';

export const dynamic = 'force-dynamic';

function toStateShape(p: AircraftPosition) {
  return {
    icao24: p.icao24,
    callsign: p.callsign ?? undefined,
    longitude: p.longitude,
    latitude: p.latitude,
    baro_altitude: p.baroAltitude ?? undefined,
    velocity: p.velocity ?? undefined,
    true_track: p.trueTrack ?? undefined,
    on_ground: p.onGround,
    squawk: p.squawk ?? undefined,
    api_time: p.apiTime,
    ac_type: p.acType ?? undefined,
    airport: p.airport ?? undefined,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bbox = parseBbox(url.searchParams.get('bbox'));
  if (!bbox) {
    return NextResponse.json({ count: 0, data: [] }, { status: 400 });
  }
  try {
    const provider = getAdsbProvider();
    const positions = await provider.getTrafficInBbox(bbox);
    const data = positions.map(toStateShape);
    return NextResponse.json({ count: data.length, data });
  } catch (err) {
    console.error('[/api/adsb/states] failed:', err);
    return NextResponse.json({ count: 0, data: [] }, { status: 500 });
  }
}
