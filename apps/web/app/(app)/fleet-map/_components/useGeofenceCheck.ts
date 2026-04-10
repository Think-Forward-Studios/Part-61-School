'use client';

import { useMemo } from 'react';
import type { OutsideAircraft } from './GeofenceAlert';
import type { FleetPosition } from './AircraftLayer';

interface GeofenceData {
  kind: string;
  geometry: unknown;
  radiusNm: string | null;
}

/**
 * Client-side geofence check.
 * Placeholder -- full turf.js implementation in Task 2.
 */
export function useGeofenceCheck(
  fleet: FleetPosition[],
  geofence: GeofenceData | null,
): { outsideAircraft: OutsideAircraft[] } {
  const outsideAircraft = useMemo((): OutsideAircraft[] => {
    if (!geofence || fleet.length === 0) return [];
    // Full implementation in Task 2
    return [];
  }, [fleet, geofence]);

  return { outsideAircraft };
}
