/**
 * GET /api/adsb/swim/tracks?bbox=latMin,lonMin,latMax,lonMax&minutes=30
 *
 * Returns synthesized aircraft tracks built from our rolling position
 * cache (see _trackCache.ts). Each track contains the last ~3 minutes
 * of positions for an aircraft whose most-recent point lies inside
 * the requested bbox.
 */
import { NextResponse } from 'next/server';
import { parseBbox } from '../../_provider';
import { readTracks } from '../../_trackCache';

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
