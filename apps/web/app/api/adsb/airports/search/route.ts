/**
 * GET /api/adsb/airports/search?q=...
 *
 * OurAirports ident/ICAO/name search. Used by the HomeAirportPanel.
 */
import { NextResponse } from 'next/server';
import { searchAirports } from '../../_ourAirports';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  try {
    const rows = await searchAirports(q);
    return NextResponse.json({ count: rows.length, data: rows });
  } catch (err) {
    console.error('[/api/adsb/airports/search] failed:', err);
    return NextResponse.json({ count: 0, data: [] }, { status: 500 });
  }
}
