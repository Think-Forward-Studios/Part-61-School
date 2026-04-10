'use client';

/**
 * ReplayTrackLayer (ADS-06).
 *
 * Renders a flight track as a graduated-color polyline using MapLibre's
 * built-in `line-gradient` paint property with `line-progress`.
 *
 * CRITICAL: The GeoJSON source MUST have lineMetrics={true} for
 * line-gradient to work (Pitfall 5 from 07-RESEARCH.md).
 *
 * Color progression: blue (oldest) -> green (middle) -> red (newest).
 */
import { Source, Layer } from 'react-map-gl/maplibre';
import type { LineLayerSpecification } from 'maplibre-gl';

interface ReplayTrackLayerProps {
  /** GeoJSON LineString of the flight track coordinates */
  trackLineString: GeoJSON.Feature<GeoJSON.LineString>;
}

const REPLAY_LINE_PAINT: LineLayerSpecification['paint'] = {
  'line-width': 4,
  'line-gradient': [
    'interpolate',
    ['linear'],
    ['line-progress'],
    0,
    '#3b82f6', // blue (oldest)
    0.5,
    '#22c55e', // green (middle)
    1,
    '#ef4444', // red (newest)
  ],
};

const REPLAY_LINE_LAYOUT: LineLayerSpecification['layout'] = {
  'line-cap': 'round',
  'line-join': 'round',
};

export function ReplayTrackLayer({ trackLineString }: ReplayTrackLayerProps) {
  return (
    <Source id="replay-track" type="geojson" lineMetrics={true} data={trackLineString}>
      <Layer id="replay-line" type="line" layout={REPLAY_LINE_LAYOUT} paint={REPLAY_LINE_PAINT} />
    </Source>
  );
}
