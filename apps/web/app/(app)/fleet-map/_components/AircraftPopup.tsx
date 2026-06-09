'use client';

import { Popup } from 'react-map-gl/maplibre';
import Link from 'next/link';
import type { FleetPosition } from './AircraftLayer';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  airborne: { label: 'Airborne', color: '#22c55e' },
  ground: { label: 'On Ground', color: '#eab308' },
  grounded: { label: 'Grounded', color: '#ef4444' },
  dispatched: { label: 'Dispatched', color: '#3b82f6' },
  no_signal: { label: 'Signal Lost', color: '#6b7280' },
  stale: { label: 'Stale Signal', color: '#eab308' },
};

function formatAge(apiTime: number): string {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - apiTime));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

// AircraftPosition values are already in feet/knots (providers
// normalize to imperial — see packages/api/src/providers/adsb/opensky.ts
// header comment). These are pure formatters, not unit converters.
function formatFeet(ft: number | null): string {
  if (ft == null) return '--';
  return `${Math.round(ft).toLocaleString()} ft`;
}

function formatKnots(kts: number | null): string {
  if (kts == null) return '--';
  return `${Math.round(kts)} kts`;
}

interface AircraftPopupProps {
  aircraft: FleetPosition;
  onClose: () => void;
  onNavigate: (aircraftId: string) => void;
}

export function AircraftPopup({ aircraft, onClose, onNavigate }: AircraftPopupProps) {
  const staleSeconds = Math.max(0, Date.now() / 1000 - aircraft.apiTime);
  let statusKey = 'airborne';
  if (aircraft.isGrounded) statusKey = 'grounded';
  else if (staleSeconds > 300) statusKey = 'no_signal';
  else if (staleSeconds > 60) statusKey = 'stale';
  else if (aircraft.onGround) statusKey = 'ground';

  const statusInfo = STATUS_LABELS[statusKey] ?? STATUS_LABELS.airborne!;

  return (
    <Popup
      longitude={aircraft.longitude}
      latitude={aircraft.latitude}
      anchor="bottom"
      onClose={onClose}
      closeOnClick={false}
      style={{ zIndex: 10 }}
    >
      <div style={{ color: '#1a1a1a', minWidth: 180, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
          {aircraft.tailNumber ?? aircraft.callsign ?? aircraft.icao24}
        </div>
        <div
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            backgroundColor: statusInfo.color,
            marginBottom: 6,
          }}
        >
          {statusInfo.label}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>
            <strong>Alt:</strong> {formatFeet(aircraft.baroAltitude)}
          </div>
          <div>
            <strong>Speed:</strong> {formatKnots(aircraft.velocity)}
          </div>
          <div>
            <strong>Heading:</strong>{' '}
            {aircraft.trueTrack != null ? `${Math.round(aircraft.trueTrack)}deg` : '--'}
          </div>
          <div>
            <strong>Updated:</strong> {formatAge(aircraft.apiTime)}
          </div>
        </div>
        {aircraft.aircraftId && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={() => onNavigate(aircraft.aircraftId!)}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid #3b82f6',
                borderRadius: 4,
                background: '#3b82f6',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              View Aircraft
            </button>
            <Link
              href={`/fleet-map/replay/${encodeURIComponent(aircraft.tailNumber ?? aircraft.callsign ?? '')}`}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid #a78bfa',
                borderRadius: 4,
                background: '#a78bfa',
                color: '#fff',
                cursor: 'pointer',
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              View Track
            </Link>
          </div>
        )}
      </div>
    </Popup>
  );
}
