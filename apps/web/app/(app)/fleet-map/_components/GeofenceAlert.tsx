'use client';

export interface OutsideAircraft {
  tailNumber: string;
  latitude: number;
  longitude: number;
  heading: number | null;
}

interface GeofenceAlertProps {
  outsideAircraft: OutsideAircraft[];
}

export function GeofenceAlert({ outsideAircraft }: GeofenceAlertProps) {
  if (outsideAircraft.length === 0) return null;

  // Placeholder -- full implementation in Task 2
  return null;
}
