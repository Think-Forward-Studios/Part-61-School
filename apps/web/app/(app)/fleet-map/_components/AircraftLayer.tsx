'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Source, Layer, useMap } from 'react-map-gl/maplibre';
import { useRouter } from 'next/navigation';
import type { MapLayerMouseEvent, SymbolLayerSpecification } from 'maplibre-gl';
import type { AircraftPosition } from '@part61/domain';
import { AircraftPopup } from './AircraftPopup';

/** Enriched fleet position from the tRPC fleetPositions response */
export interface FleetPosition extends AircraftPosition {
  aircraftId: string | null;
  tailNumber: string | null;
  isGrounded: boolean;
  activeReservationId: string | null;
}

type AircraftStatus = 'airborne' | 'ground' | 'grounded' | 'dispatched' | 'no_signal' | 'stale';

function deriveStatus(pos: FleetPosition): AircraftStatus {
  const staleSeconds = Date.now() / 1000 - pos.apiTime;
  if (pos.isGrounded) return 'grounded';
  if (staleSeconds > 300) return 'no_signal';
  if (staleSeconds > 60) return 'stale';
  if (pos.onGround) return 'ground';
  return 'airborne';
}

const FLEET_LAYER: SymbolLayerSpecification = {
  id: 'fleet-aircraft',
  type: 'symbol',
  source: 'fleet',
  layout: {
    'icon-image': 'airplane',
    'icon-size': 0.8,
    'icon-rotate': ['coalesce', ['get', 'heading'], 0],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': true,
    'text-field': ['get', 'tailNumber'],
    'text-offset': [0, 1.5],
    'text-size': 11,
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
  },
  paint: {
    'icon-color': [
      'match',
      ['get', 'status'],
      'airborne',
      '#22c55e',
      'ground',
      '#eab308',
      'grounded',
      '#ef4444',
      'dispatched',
      '#3b82f6',
      'stale',
      '#eab308',
      '#6b7280', // no_signal / fallback
    ],
    'icon-opacity': [
      'case',
      ['>', ['get', 'staleSeconds'], 300],
      0.3,
      ['>', ['get', 'staleSeconds'], 60],
      0.6,
      1,
    ],
    'text-color': '#ffffff',
    'text-halo-color': '#000000',
    'text-halo-width': 1,
  },
};

interface AircraftLayerProps {
  fleet: FleetPosition[];
}

export function AircraftLayer({ fleet }: AircraftLayerProps) {
  const router = useRouter();
  const { fleetMap: mapRef } = useMap();
  const [selectedAircraft, setSelectedAircraft] = useState<FleetPosition | null>(null);
  const pulseRef = useRef<number | null>(null);

  // Build GeoJSON from fleet positions
  const geojson = useMemo((): GeoJSON.FeatureCollection => {
    return {
      type: 'FeatureCollection',
      features: fleet.map((pos) => {
        const status = deriveStatus(pos);
        const staleSeconds = Math.max(0, Date.now() / 1000 - pos.apiTime);
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [pos.longitude, pos.latitude],
          },
          properties: {
            tailNumber: pos.tailNumber ?? pos.callsign ?? pos.icao24,
            heading: pos.trueTrack ?? 0,
            status,
            staleSeconds: Math.round(staleSeconds),
            aircraftId: pos.aircraftId,
          },
        };
      }),
    };
  }, [fleet]);

  // Signal-lost pulsing animation
  const hasSignalLost = fleet.some((p) => Date.now() / 1000 - p.apiTime > 300);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map || !hasSignalLost) {
      if (pulseRef.current != null) {
        cancelAnimationFrame(pulseRef.current);
        pulseRef.current = null;
      }
      return;
    }

    let last = 0;
    let dim = true;
    const animate = (ts: number) => {
      if (ts - last > 800) {
        last = ts;
        dim = !dim;
        if (map.getLayer('fleet-aircraft')) {
          map.setPaintProperty('fleet-aircraft', 'icon-opacity', [
            'case',
            ['>', ['get', 'staleSeconds'], 300],
            dim ? 0.15 : 0.4,
            ['>', ['get', 'staleSeconds'], 60],
            0.6,
            1,
          ]);
        }
      }
      pulseRef.current = requestAnimationFrame(animate);
    };
    pulseRef.current = requestAnimationFrame(animate);

    return () => {
      if (pulseRef.current != null) {
        cancelAnimationFrame(pulseRef.current);
        pulseRef.current = null;
      }
    };
  }, [mapRef, hasSignalLost]);

  // Click handler
  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties;
      const aircraftId = props?.aircraftId;

      // Find the fleet position for popup
      const pos = fleet.find((p) => p.aircraftId === aircraftId);
      if (pos) {
        setSelectedAircraft(pos);
      }
    },
    [fleet],
  );

  // Register click handler on the map layer
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', 'fleet-aircraft', handleClick as unknown as (e: MapLayerMouseEvent) => void);
    map.on('mouseenter', 'fleet-aircraft', onMouseEnter);
    map.on('mouseleave', 'fleet-aircraft', onMouseLeave);

    return () => {
      map.off('click', 'fleet-aircraft', handleClick as unknown as (e: MapLayerMouseEvent) => void);
      map.off('mouseenter', 'fleet-aircraft', onMouseEnter);
      map.off('mouseleave', 'fleet-aircraft', onMouseLeave);
    };
  }, [mapRef, handleClick]);

  const handleNavigate = useCallback(
    (aircraftId: string) => {
      router.push(`/admin/aircraft/${aircraftId}`);
    },
    [router],
  );

  return (
    <>
      <Source id="fleet" type="geojson" data={geojson}>
        <Layer {...FLEET_LAYER} />
      </Source>
      {selectedAircraft && (
        <AircraftPopup
          aircraft={selectedAircraft}
          onClose={() => setSelectedAircraft(null)}
          onNavigate={handleNavigate}
        />
      )}
    </>
  );
}
