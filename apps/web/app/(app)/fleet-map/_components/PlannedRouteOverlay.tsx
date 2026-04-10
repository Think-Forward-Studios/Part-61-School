'use client';

/**
 * PlannedRouteOverlay (ADS-06).
 *
 * Renders the planned XC route as a text label when the aircraft has an
 * active reservation with route_string. In v1 we show the route string
 * as a formatted text overlay since we don't have a waypoint geocoding
 * service wired up for resolving airport identifiers to coordinates.
 *
 * If geocoded coordinates become available in v2, this component would
 * render a dashed line layer alongside the actual track.
 */

interface PlannedRouteOverlayProps {
  /** Route string from reservation (e.g. "KDFW KACT KAUS") */
  routeString: string;
}

export function PlannedRouteOverlay({ routeString }: PlannedRouteOverlayProps) {
  // Parse route string into segments for display
  const segments = routeString
    .trim()
    .split(/[\s\-]+/)
    .filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: 12,
        zIndex: 5,
        background: 'rgba(15, 15, 25, 0.85)',
        border: '1px solid rgba(167, 139, 250, 0.5)',
        borderRadius: 6,
        padding: '8px 12px',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 320,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: '#a78bfa',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 4,
        }}
      >
        Planned Route
      </div>
      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
        {segments.join(' \u2192 ')}
      </div>
    </div>
  );
}
