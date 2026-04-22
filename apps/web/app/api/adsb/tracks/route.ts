/**
 * GET /api/adsb/tracks?bbox=...
 *
 * Legacy path that mirrors /swim/tracks. LiveMapView calls both
 * depending on source toggle; we serve both the same.
 */
import { NextResponse } from 'next/server';
import { parseBbox } from '../_provider';
import { readTracks } from '../_trackCache';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bbox = parseBbox(url.searchParams.get('bbox'));
  if (!bbox) {
    return NextResponse.json({ count: 0, data: [] }, { status: 400 });
  }
  const tracks = readTracks(bbox);
  return NextResponse.json({ count: tracks.length, data: tracks });
}
