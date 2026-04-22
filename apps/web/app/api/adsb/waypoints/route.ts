/**
 * GET /api/adsb/waypoints?bbox=latMin,lonMin,latMax,lonMax
 *
 * RNAV waypoints / fixes. OurAirports doesn't publish these, so for
 * now the layer is intentionally empty. Future work: seed FAA NASR
 * (CIFP) fixes into our own DB.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ count: 0, data: [] });
}
