/**
 * Shared ADS-B provider factory for the /api/adsb/* routes.
 *
 * Mirrors the logic in packages/api/src/routers/adsb.ts so the REST
 * proxy routes and the tRPC router pick the same provider based on
 * env. Exposing a module-level singleton keeps token caching (inside
 * OpenSkyAdsbProvider) working across invocations within a warm
 * lambda.
 */
import type { AdsbProvider } from '@part61/domain';
import {
  AdsbFiProvider,
  CompositeAdsbProvider,
  OpenSkyAdsbProvider,
  SwimAdsbProvider,
} from '@part61/api';

let cached: AdsbProvider | null = null;

function build(): AdsbProvider {
  const explicit = (process.env.ADSB_PROVIDER ?? '').toLowerCase();
  const openskyId = process.env.OPENSKY_CLIENT_ID;
  const openskySecret = process.env.OPENSKY_CLIENT_SECRET;
  const hasOpenSky = !!(openskyId && openskySecret);

  if (explicit === 'swim') {
    return new SwimAdsbProvider(process.env.ADSB_API_BASE_URL ?? 'http://localhost:3002');
  }
  if (explicit === 'adsbfi') {
    return new AdsbFiProvider(process.env.ADSB_API_BASE_URL ?? 'https://api.adsb.fi/v2');
  }
  if (explicit === 'opensky' || (explicit === '' && hasOpenSky)) {
    if (hasOpenSky) {
      // Wrap OpenSky in a composite with adsb.fi as the fallback.
      // OpenSky sometimes times out from Vercel's lambda edges
      // (cold start + OAuth token + /states/all chain); the
      // composite falls back to adsb.fi so the map stays alive.
      return new CompositeAdsbProvider(
        new OpenSkyAdsbProvider(openskyId!, openskySecret!),
        new AdsbFiProvider(),
        'opensky→adsbfi',
      );
    }
    return new AdsbFiProvider();
  }
  return new AdsbFiProvider();
}

export function getAdsbProvider(): AdsbProvider {
  if (!cached) cached = build();
  return cached;
}

/**
 * Parse "latMin,lonMin,latMax,lonMax" from the `bbox` query param.
 * Returns null if malformed.
 */
export function parseBbox(
  raw: string | null,
): { latMin: number; lonMin: number; latMax: number; lonMax: number } | null {
  if (!raw) return null;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [latMin, lonMin, latMax, lonMax] = parts as [number, number, number, number];
  return { latMin, lonMin, latMax, lonMax };
}
