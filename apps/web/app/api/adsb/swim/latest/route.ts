/**
 * GET /api/adsb/swim/latest?bbox=latMin,lonMin,latMax,lonMax&minutes=5
 *
 * Compat shim for the LiveMapView client, which was written against
 * a separate ADS-B Tracker service's `/api/swim/latest` endpoint. We
 * now satisfy the same shape from our own server using whichever
 * AdsbProvider is configured (OpenSky when credentials are present,
 * adsb.fi otherwise).
 */
import { NextResponse } from 'next/server';
import type { AircraftPosition } from '@part61/domain';
import { getAdsbProvider, parseBbox } from '../../_provider';
import { ingest } from '../../_trackCache';

export const dynamic = 'force-dynamic';

function toSwimShape(p: AircraftPosition) {
  return {
    icao24: p.icao24,
    callsign: p.callsign,
    latitude: p.latitude,
    longitude: p.longitude,
    baro_altitude: p.baroAltitude,
    velocity: p.velocity,
    true_track: p.trueTrack,
    vertical_rate: p.verticalRate,
    on_ground: p.onGround,
    squawk: p.squawk,
    api_time: p.apiTime,
    ac_type: p.acType,
    airport: p.airport,
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
    // Feed the rolling track cache so /swim/tracks can reconstruct
    // aircraft trails from the last N polling cycles.
    ingest(positions);
    const data = positions.map(toSwimShape);
    return NextResponse.json({ count: data.length, data });
  } catch (err) {
    console.error('[/api/adsb/swim/latest] failed:', err);
    return NextResponse.json({ count: 0, data: [] }, { status: 500 });
  }
}
