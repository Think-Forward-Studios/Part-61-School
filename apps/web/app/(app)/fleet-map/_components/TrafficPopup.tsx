'use client';

import { Popup } from 'react-map-gl/maplibre';
import type { AircraftPosition } from '@part61/domain';

function formatAge(apiTime: number): string {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - apiTime));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

// Per AircraftPosition contract (see packages/domain/src/adsb.ts and
// the OpenSky provider header comment), baroAltitude is already in
// feet and velocity is already in knots — both providers normalize
// to imperial at the boundary. These helpers just format, no unit
// conversion.
function formatFeet(ft: number | null): string {
  if (ft == null) return '--';
  return `${Math.round(ft).toLocaleString()} ft`;
}

function formatKnots(kts: number | null): string {
  if (kts == null) return '--';
  return `${Math.round(kts)} kts`;
}

interface TrafficPopupProps {
  aircraft: AircraftPosition;
  onClose: () => void;
}

export function TrafficPopup({ aircraft, onClose }: TrafficPopupProps) {
  return (
    <Popup
      longitude={aircraft.longitude}
      latitude={aircraft.latitude}
      anchor="bottom"
      onClose={onClose}
      closeOnClick={false}
      style={{ zIndex: 10 }}
    >
      <div style={{ color: '#1a1a1a', minWidth: 160, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
          {aircraft.callsign?.trim() || aircraft.icao24}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.6 }}>
          <div>
            <strong>ICAO:</strong> {aircraft.icao24}
          </div>
          {aircraft.callsign && (
            <div>
              <strong>Callsign:</strong> {aircraft.callsign.trim()}
            </div>
          )}
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
          {aircraft.acType && (
            <div>
              <strong>Type:</strong> {aircraft.acType}
            </div>
          )}
          <div>
            <strong>Updated:</strong> {formatAge(aircraft.apiTime)}
          </div>
        </div>
      </div>
    </Popup>
  );
}
