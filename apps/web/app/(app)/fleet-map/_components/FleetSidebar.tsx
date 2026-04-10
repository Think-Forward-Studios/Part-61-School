'use client';

import { useMemo } from 'react';
import type { FleetPosition } from './AircraftLayer';

type AircraftStatus = 'airborne' | 'ground' | 'grounded' | 'dispatched' | 'no_signal' | 'stale';

const STATUS_ORDER: Record<AircraftStatus, number> = {
  airborne: 0,
  ground: 1,
  dispatched: 2,
  stale: 3,
  no_signal: 4,
  grounded: 5,
};

const STATUS_COLORS: Record<AircraftStatus, string> = {
  airborne: '#22c55e',
  ground: '#eab308',
  grounded: '#ef4444',
  dispatched: '#3b82f6',
  no_signal: '#6b7280',
  stale: '#eab308',
};

const STATUS_LABELS: Record<AircraftStatus, string> = {
  airborne: 'Airborne',
  ground: 'On Ground',
  grounded: 'Grounded',
  dispatched: 'Dispatched',
  no_signal: 'Signal Lost',
  stale: 'Stale',
};

function deriveStatus(pos: FleetPosition): AircraftStatus {
  const staleSeconds = Date.now() / 1000 - pos.apiTime;
  if (pos.isGrounded) return 'grounded';
  if (staleSeconds > 300) return 'no_signal';
  if (staleSeconds > 60) return 'stale';
  if (pos.onGround) return 'ground';
  return 'airborne';
}

function formatAge(apiTime: number): string {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - apiTime));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function metersToFeet(m: number | null): string {
  if (m == null) return '--';
  return `${Math.round(m * 3.28084).toLocaleString()} ft`;
}

function msToKnots(ms: number | null): string {
  if (ms == null) return '--';
  return `${Math.round(ms * 1.94384)} kts`;
}

interface FleetSidebarProps {
  fleet: FleetPosition[];
  open: boolean;
  onToggle: () => void;
  onCenterAircraft: (lon: number, lat: number) => void;
}

export function FleetSidebar({ fleet, open, onToggle, onCenterAircraft }: FleetSidebarProps) {
  const sorted = useMemo(() => {
    return [...fleet].sort((a, b) => {
      const statusA = STATUS_ORDER[deriveStatus(a)];
      const statusB = STATUS_ORDER[deriveStatus(b)];
      if (statusA !== statusB) return statusA - statusB;
      return (a.tailNumber ?? '').localeCompare(b.tailNumber ?? '');
    });
  }, [fleet]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        style={{
          position: 'absolute',
          right: open ? 280 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 20,
          background: '#1a1a2e',
          color: '#fff',
          border: '1px solid #333',
          borderRadius: open ? '4px 0 0 4px' : '4px 0 0 4px',
          padding: '8px 4px',
          cursor: 'pointer',
          fontSize: 14,
          transition: 'right 0.2s ease',
        }}
        title={open ? 'Close sidebar' : 'Open fleet sidebar'}
      >
        {open ? '\u25B6' : '\u25C0'}
      </button>

      {/* Sidebar panel */}
      <div
        style={{
          width: open ? 280 : 0,
          overflow: 'hidden',
          background: '#0f0f1a',
          borderLeft: open ? '1px solid #333' : 'none',
          transition: 'width 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #333',
            fontWeight: 700,
            fontSize: 14,
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          Fleet ({fleet.length})
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sorted.map((pos) => {
            const status = deriveStatus(pos);
            const color = STATUS_COLORS[status];
            const label = STATUS_LABELS[status];
            const tail = pos.tailNumber ?? pos.callsign ?? pos.icao24;

            return (
              <button
                key={pos.icao24 + (pos.aircraftId ?? '')}
                onClick={() => onCenterAircraft(pos.longitude, pos.latitude)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #1a1a2e',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'system-ui, sans-serif',
                  color: '#e0e0e0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: color,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{tail}</span>
                  <span style={{ fontSize: 10, color: '#888', marginLeft: 'auto' }}>{label}</span>
                </div>
                {(status === 'airborne' || status === 'ground') && (
                  <div style={{ fontSize: 11, color: '#aaa', paddingLeft: 16 }}>
                    {metersToFeet(pos.baroAltitude)} / {msToKnots(pos.velocity)}
                  </div>
                )}
                {(status === 'stale' || status === 'no_signal') && (
                  <div style={{ fontSize: 11, color: '#888', paddingLeft: 16 }}>
                    Last seen: {formatAge(pos.apiTime)}
                  </div>
                )}
              </button>
            );
          })}
          {fleet.length === 0 && (
            <div
              style={{
                padding: '24px 16px',
                color: '#666',
                fontSize: 13,
                textAlign: 'center',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              No aircraft positions available
            </div>
          )}
        </div>
      </div>
    </>
  );
}
