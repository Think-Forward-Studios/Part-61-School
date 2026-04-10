'use client';

interface GeofenceOverlayProps {
  geofence: {
    kind: string;
    geometry: unknown;
    radiusNm: string | null;
  } | null;
}

export function GeofenceOverlay({ geofence }: GeofenceOverlayProps) {
  if (!geofence) return null;

  // Placeholder -- full implementation in Task 2
  return null;
}
