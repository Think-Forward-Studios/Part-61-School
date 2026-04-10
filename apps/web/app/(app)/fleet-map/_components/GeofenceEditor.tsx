'use client';

interface GeofenceEditorProps {
  geofence: {
    id: string;
    kind: string;
    geometry: unknown;
    radiusNm: string | null;
  } | null;
}

export function GeofenceEditor(_props: GeofenceEditorProps) {
  // Placeholder -- full implementation in Task 2
  return null;
}
