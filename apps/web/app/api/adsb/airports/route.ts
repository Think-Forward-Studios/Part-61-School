/**
 * GET /api/adsb/airports?bbox=latMin,lonMin,latMax,lonMax
 *
 * OurAirports data (CC0) filtered to the requested bbox.
 */
import { NextResponse } from 'next/server';
import { parseBbox } from '../_provider';
import { airportsInBbox } from '../_ourAirports';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bbox = parseBbox(url.searchParams.get('bbox'));
  if (!bbox) {
    return NextResponse.json({ count: 0, data: [] }, { status: 400 });
  }
  try {
    const rows = await airportsInBbox(bbox);
    return NextResponse.json({ count: rows.length, data: rows });
  } catch (err) {
    console.error('[/api/adsb/airports] failed:', err);
    return NextResponse.json({ count: 0, data: [] }, { status: 500 });
  }
}
