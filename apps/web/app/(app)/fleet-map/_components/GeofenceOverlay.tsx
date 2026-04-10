'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import { circle as turfCircle } from '@turf/circle';
import type { FillLayerSpecification, LineLayerSpecification } from 'maplibre-gl';

interface GeofenceOverlayProps {
  geofence: {
    kind: string;
    geometry: unknown;
    radiusNm: string | null;
  } | null;
}

const FILL_LAYER: FillLayerSpecification = {
  id: 'geofence-fill',
  type: 'fill',
  source: 'geofence',
  paint: {
    'fill-color': '#3b82f6',
    'fill-opacity': 0.08,
  },
};

const LINE_LAYER: LineLayerSpecification = {
  id: 'geofence-line',
  type: 'line',
  source: 'geofence',
  paint: {
    'line-color': '#3b82f6',
    'line-width': 2,
    'line-opacity': 0.5,
  },
};

export function GeofenceOverlay({ geofence }: GeofenceOverlayProps) {
  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!geofence) return null;

    try {
      let geometry: GeoJSON.Geometry;

      if (geofence.kind === 'circle') {
        const geo = geofence.geometry as GeoJSON.Point;
        if (!geo || !('coordinates' in geo)) return null;
        const radiusKm = (parseFloat(geofence.radiusNm ?? '20') || 20) * 1.852;
        const circleFeature = turfCircle(geo.coordinates as [number, number], radiusKm, {
          steps: 72,
          units: 'kilometers',
        });
        geometry = circleFeature.geometry;
      } else {
        geometry = geofence.geometry as GeoJSON.Polygon;
        if (!geometry || !('coordinates' in geometry)) return null;
      }

      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry,
            properties: {},
          },
        ],
      };
    } catch {
      return null;
    }
  }, [geofence]);

  if (!geojson) return null;

  return (
    <Source id="geofence" type="geojson" data={geojson}>
      <Layer {...FILL_LAYER} />
      <Layer {...LINE_LAYER} />
    </Source>
  );
}
