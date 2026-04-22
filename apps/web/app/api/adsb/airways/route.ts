/**
 * GET /api/adsb/airways?bbox=latMin,lonMin,latMax,lonMax
 *
 * Victor / J airways. OurAirports doesn't publish these. Empty for
 * now; future work: seed FAA NASR AWY data.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ count: 0, data: [] });
}
