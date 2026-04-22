/**
 * GET /api/adsb/navaids?bbox=latMin,lonMin,latMax,lonMax
 *
 * OurAirports navaids (VOR/DME/NDB/TACAN, CC0) in the requested bbox.
 */
import { NextResponse } from 'next/server';
import { parseBbox } from '../_provider';
import { navaidsInBbox } from '../_ourAirports';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bbox = parseBbox(url.searchParams.get('bbox'));
  if (!bbox) {
    return NextResponse.json({ count: 0, data: [] }, { status: 400 });
  }
  try {
    const rows = await navaidsInBbox(bbox);
    return NextResponse.json({ count: rows.length, data: rows });
  } catch (err) {
    console.error('[/api/adsb/navaids] failed:', err);
    return NextResponse.json({ count: 0, data: [] }, { status: 500 });
  }
}
