'use client';

import { useCallback, useEffect, useState } from 'react';
import Map, { NavigationControl, MapProvider, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BBox } from '@part61/domain';
import { trpc } from '@/lib/trpc/client';
import { AircraftLayer } from './_components/AircraftLayer';
import { TrafficLayer } from './_components/TrafficLayer';
import { FleetSidebar } from './_components/FleetSidebar';
import { FeedStatusBanner } from './_components/FeedStatusBanner';
import { GeofenceOverlay } from './_components/GeofenceOverlay';
import { GeofenceAlert } from './_components/GeofenceAlert';
import { GeofenceEditor } from './_components/GeofenceEditor';
import { useGeofenceCheck } from './_components/useGeofenceCheck';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Default to continental US center if no base coordinates
const DEFAULT_CENTER: [number, number] = [-98.5, 39.8];
const DEFAULT_ZOOM = 4;
const REFETCH_INTERVAL = 5_000;

/**
 * Draw a north-pointing airplane silhouette on a 64x64 canvas and return
 * ImageData suitable for MapLibre `map.addImage(..., { sdf: true })`.
 */
function createAirplaneImageData(): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.clearRect(0, 0, size, size);

  // White airplane on transparent background (SDF expects white on transparent)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();

  // Fuselage pointing north (up)
  const cx = 32;
  ctx.moveTo(cx, 6); // nose
  ctx.lineTo(cx + 4, 20);
  // Right wing
  ctx.lineTo(cx + 22, 34);
  ctx.lineTo(cx + 22, 38);
  ctx.lineTo(cx + 4, 32);
  // Right tail
  ctx.lineTo(cx + 4, 48);
  ctx.lineTo(cx + 12, 54);
  ctx.lineTo(cx + 12, 57);
  ctx.lineTo(cx + 2, 52);
  // Tail center
  ctx.lineTo(cx, 54);
  // Left tail (mirror)
  ctx.lineTo(cx - 2, 52);
  ctx.lineTo(cx - 12, 57);
  ctx.lineTo(cx - 12, 54);
  ctx.lineTo(cx - 4, 48);
  // Left wing
  ctx.lineTo(cx - 4, 32);
  ctx.lineTo(cx - 22, 38);
  ctx.lineTo(cx - 22, 34);
  ctx.lineTo(cx - 4, 20);
  ctx.closePath();
  ctx.fill();

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: imageData.data };
}

function FleetMapInner() {
  const { fleetMap: mapRef } = useMap();
  const [iconLoaded, setIconLoaded] = useState(false);
  const [bbox, setBbox] = useState<BBox>({
    latMin: 24,
    lonMin: -125,
    latMax: 50,
    lonMax: -66,
  });
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );

  // Load airplane SDF icon when map is ready
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const handleLoad = () => {
      if (map.hasImage('airplane')) {
        setIconLoaded(true);
        return;
      }
      try {
        const imgData = createAirplaneImageData();
        map.addImage('airplane', imgData, { sdf: true });
        setIconLoaded(true);
      } catch (err) {
        console.error('Failed to create airplane icon:', err);
      }
    };

    if (map.loaded()) {
      handleLoad();
    } else {
      map.on('load', handleLoad);
    }
    return () => {
      map.off('load', handleLoad);
    };
  }, [mapRef]);

  // Update bbox on map move
  const handleMoveEnd = useCallback(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const bounds = map.getBounds();
    setBbox({
      latMin: bounds.getSouth(),
      lonMin: bounds.getWest(),
      latMax: bounds.getNorth(),
      lonMax: bounds.getEast(),
    });
  }, [mapRef]);

  // Fleet positions (5s polling)
  const fleetQuery = trpc.adsb.fleetPositions.useQuery(
    { bbox },
    {
      refetchInterval: REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
      placeholderData: (prev) => prev,
    },
  );

  // Traffic positions (5s polling)
  const trafficQuery = trpc.adsb.traffic.useQuery(
    { bbox },
    {
      refetchInterval: REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
      placeholderData: (prev) => prev,
    },
  );

  // Geofence query (admin only -- will fail silently for non-admins)
  const geofenceQuery = trpc.admin.geofence.getActive.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const fleet = fleetQuery.data?.fleet ?? [];
  const feedHealthy = fleetQuery.data?.feedHealthy ?? true;
  const traffic = trafficQuery.data?.traffic ?? [];
  const activeGeofence = geofenceQuery.data ?? null;

  // Geofence check
  const { outsideAircraft } = useGeofenceCheck(fleet, activeGeofence);

  // Center map on aircraft
  const handleCenterAircraft = useCallback(
    (lon: number, lat: number) => {
      mapRef?.flyTo({ center: [lon, lat], zoom: 13, duration: 1000 });
    },
    [mapRef],
  );

  return (
    <div style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <FeedStatusBanner feedHealthy={feedHealthy} isError={fleetQuery.isError} />
        <GeofenceAlert outsideAircraft={outsideAircraft} />
        <Map
          id="fleetMap"
          mapStyle={MAP_STYLE}
          initialViewState={{
            longitude: DEFAULT_CENTER[0],
            latitude: DEFAULT_CENTER[1],
            zoom: DEFAULT_ZOOM,
          }}
          style={{ width: '100%', height: '100%' }}
          onMoveEnd={handleMoveEnd}
          attributionControl={false}
        >
          <NavigationControl position="top-left" />
          {iconLoaded && <AircraftLayer fleet={fleet} />}
          {iconLoaded && <TrafficLayer traffic={traffic} />}
          <GeofenceOverlay geofence={activeGeofence} />
          <GeofenceEditor geofence={activeGeofence} />
        </Map>
      </div>
      <FleetSidebar
        fleet={fleet}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onCenterAircraft={handleCenterAircraft}
      />
    </div>
  );
}

export default function FleetMapClient() {
  return (
    <MapProvider>
      <FleetMapInner />
    </MapProvider>
  );
}
