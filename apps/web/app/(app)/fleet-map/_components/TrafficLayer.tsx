'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Source, Layer, useMap } from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent, SymbolLayerSpecification } from 'maplibre-gl';
import type { AircraftPosition } from '@part61/domain';
import { TrafficPopup } from './TrafficPopup';

const TRAFFIC_LAYER: SymbolLayerSpecification = {
  id: 'traffic-aircraft',
  type: 'symbol',
  source: 'traffic',
  layout: {
    'icon-image': 'airplane',
    'icon-size': 0.35,
    'icon-rotate': ['coalesce', ['get', 'heading'], 0],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': false,
  },
  paint: {
    'icon-color': '#ffffff',
    'icon-opacity': 0.7,
  },
};

interface TrafficLayerProps {
  traffic: AircraftPosition[];
}

export function TrafficLayer({ traffic }: TrafficLayerProps) {
  const { fleetMap: mapRef } = useMap();
  const [selectedTraffic, setSelectedTraffic] = useState<AircraftPosition | null>(null);

  const geojson = useMemo((): GeoJSON.FeatureCollection => {
    return {
      type: 'FeatureCollection',
      features: traffic.map((pos) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [pos.longitude, pos.latitude],
        },
        properties: {
          icao24: pos.icao24,
          callsign: pos.callsign ?? '',
          heading: pos.trueTrack ?? 0,
          altitude: pos.baroAltitude,
          velocity: pos.velocity,
          acType: pos.acType ?? '',
          apiTime: pos.apiTime,
        },
      })),
    };
  }, [traffic]);

  // Click handler for traffic
  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties;
      const pos = traffic.find((t) => t.icao24 === props?.icao24);
      if (pos) setSelectedTraffic(pos);
    },
    [traffic],
  );

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', 'traffic-aircraft', handleClick as unknown as (e: MapLayerMouseEvent) => void);
    map.on('mouseenter', 'traffic-aircraft', onMouseEnter);
    map.on('mouseleave', 'traffic-aircraft', onMouseLeave);

    return () => {
      map.off(
        'click',
        'traffic-aircraft',
        handleClick as unknown as (e: MapLayerMouseEvent) => void,
      );
      map.off('mouseenter', 'traffic-aircraft', onMouseEnter);
      map.off('mouseleave', 'traffic-aircraft', onMouseLeave);
    };
  }, [mapRef, handleClick]);

  return (
    <>
      <Source id="traffic" type="geojson" data={geojson}>
        <Layer {...TRAFFIC_LAYER} />
      </Source>
      {selectedTraffic && (
        <TrafficPopup aircraft={selectedTraffic} onClose={() => setSelectedTraffic(null)} />
      )}
    </>
  );
}
