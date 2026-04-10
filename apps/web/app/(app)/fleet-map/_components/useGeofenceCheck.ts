'use client';

import { useMemo } from 'react';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { circle as turfCircle } from '@turf/circle';
import { point } from '@turf/helpers';
import type { Feature, Polygon } from 'geojson';
import type { OutsideAircraft } from './GeofenceAlert';
import type { FleetPosition } from './AircraftLayer';

interface GeofenceData {
  kind: string;
  geometry: unknown;
  radiusNm: string | null;
}

/**
 * Convert a geofence definition to a turf-compatible polygon feature.
 * Circle geofences are expanded to a 72-sided polygon approximation.
 */
function geofenceToPolygon(gf: GeofenceData): Feature<Polygon> | null {
  try {
    if (gf.kind === 'circle') {
      const geo = gf.geometry as GeoJSON.Point;
      if (!geo || !('coordinates' in geo)) return null;
      const radiusKm = (parseFloat(gf.radiusNm ?? '20') || 20) * 1.852;
      return turfCircle(geo.coordinates as [number, number], radiusKm, {
        steps: 72,
        units: 'kilometers',
      });
    }

    // Polygon
    const geo = gf.geometry as GeoJSON.Polygon;
    if (!geo || !('coordinates' in geo)) return null;
    return {
      type: 'Feature',
      geometry: geo,
      properties: {},
    };
  } catch {
    return null;
  }
}

/**
 * Client-side geofence check. Runs on each poll cycle.
 * Only checks airborne and ground aircraft (skip grounded -- no real position).
 */
export function useGeofenceCheck(
  fleet: FleetPosition[],
  geofence: GeofenceData | null,
): { outsideAircraft: OutsideAircraft[] } {
  // Memoize the polygon conversion (only recomputes when geofence changes)
  const fencePolygon = useMemo(() => {
    if (!geofence) return null;
    return geofenceToPolygon(geofence);
  }, [geofence]);

  const outsideAircraft = useMemo((): OutsideAircraft[] => {
    if (!fencePolygon || fleet.length === 0) return [];

    const outside: OutsideAircraft[] = [];

    for (const pos of fleet) {
      // Skip grounded aircraft (no real position) and signal-lost
      if (pos.isGrounded) continue;
      const staleSeconds = Date.now() / 1000 - pos.apiTime;
      if (staleSeconds > 300) continue; // signal lost, skip

      const pt = point([pos.longitude, pos.latitude]);
      if (!booleanPointInPolygon(pt, fencePolygon)) {
        outside.push({
          tailNumber: pos.tailNumber ?? pos.callsign ?? pos.icao24,
          latitude: pos.latitude,
          longitude: pos.longitude,
          heading: pos.trueTrack,
        });
      }
    }

    return outside;
  }, [fleet, fencePolygon]);

  return { outsideAircraft };
}
