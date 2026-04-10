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

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 31,
        background: '#991b1b',
        color: '#fecaca',
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 700,
        fontFamily: 'system-ui, sans-serif',
        borderBottom: '2px solid #ef4444',
      }}
    >
      {outsideAircraft.map((ac) => (
        <div key={ac.tailNumber} style={{ marginBottom: outsideAircraft.length > 1 ? 4 : 0 }}>
          Warning: {ac.tailNumber} outside training area &mdash; last seen at{' '}
          {ac.latitude.toFixed(4)}, {ac.longitude.toFixed(4)}
          {ac.heading != null ? ` heading ${Math.round(ac.heading)} degrees` : ''}
        </div>
      ))}
    </div>
  );
}
