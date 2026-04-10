'use client';

/**
 * ReplayClient (ADS-06).
 *
 * Renders a MapLibre map with the most recent flight track for a given
 * tail number. Features:
 * - Graduated polyline (blue->green->red by time) via ReplayTrackLayer
 * - Aircraft icon animating along the track with requestAnimationFrame
 * - Playback controls (play/pause, slider, speed selector)
 * - Planned XC route overlay when reservation has route_string
 * - Back to Fleet Map navigation
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Source, Layer, NavigationControl, MapProvider, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { SymbolLayerSpecification } from 'maplibre-gl';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { ReplayTrackLayer } from '../../_components/ReplayTrackLayer';
import { PlannedRouteOverlay } from '../../_components/PlannedRouteOverlay';
import { ReplayControls } from '../../_components/ReplayControls';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** Draw a north-pointing airplane silhouette on a 64x64 canvas (same as FleetMapClient). */
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
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const cx = 32;
  ctx.moveTo(cx, 6);
  ctx.lineTo(cx + 4, 20);
  ctx.lineTo(cx + 22, 34);
  ctx.lineTo(cx + 22, 38);
  ctx.lineTo(cx + 4, 32);
  ctx.lineTo(cx + 4, 48);
  ctx.lineTo(cx + 12, 54);
  ctx.lineTo(cx + 12, 57);
  ctx.lineTo(cx + 2, 52);
  ctx.lineTo(cx, 54);
  ctx.lineTo(cx - 2, 52);
  ctx.lineTo(cx - 12, 57);
  ctx.lineTo(cx - 12, 54);
  ctx.lineTo(cx - 4, 48);
  ctx.lineTo(cx - 4, 32);
  ctx.lineTo(cx - 22, 38);
  ctx.lineTo(cx - 22, 34);
  ctx.lineTo(cx - 4, 20);
  ctx.closePath();
  ctx.fill();

  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: imageData.data };
}

/** Compute bearing in degrees from point A to point B. */
function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * (180 / Math.PI);
  if (brng < 0) brng += 360;
  return brng;
}

/** Linearly interpolate between two numbers. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Given a progress (0.0-1.0) and arrays of coordinates, return the
 * interpolated position + bearing + altitude.
 */
function interpolateTrack(
  progress: number,
  lons: number[],
  lats: number[],
  alts: (number | null)[],
): { lon: number; lat: number; alt: number | null; bearing: number } {
  if (lons.length === 0) return { lon: 0, lat: 0, alt: null, bearing: 0 };
  if (lons.length === 1) return { lon: lons[0]!, lat: lats[0]!, alt: alts[0] ?? null, bearing: 0 };

  const maxIdx = lons.length - 1;
  const exactIdx = progress * maxIdx;
  const idx = Math.min(Math.floor(exactIdx), maxIdx - 1);
  const t = exactIdx - idx;

  const lon = lerp(lons[idx]!, lons[idx + 1]!, t);
  const lat = lerp(lats[idx]!, lats[idx + 1]!, t);

  const a1 = alts[idx];
  const a2 = alts[idx + 1];
  const alt = a1 != null && a2 != null ? lerp(a1, a2, t) : (a1 ?? a2 ?? null);

  const bearing = computeBearing(lats[idx]!, lons[idx]!, lats[idx + 1]!, lons[idx + 1]!);

  return { lon, lat, alt, bearing };
}

interface ReplayInnerProps {
  tailNumber: string;
}

function ReplayInner({ tailNumber }: ReplayInnerProps) {
  const { replayMap: mapRef } = useMap();
  const [iconLoaded, setIconLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const progressRef = useRef(0);

  // Keep progressRef in sync
  progressRef.current = progress;

  // Fetch track data
  const trackQuery = trpc.adsb.flightTrack.useQuery(
    { tailNumber, minutes: 120 },
    { refetchOnWindowFocus: false },
  );

  const track = trackQuery.data?.track ?? null;
  const plannedRoute = trackQuery.data?.plannedRoute ?? null;

  // Load airplane SDF icon
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

  // Fit bounds to track extent when data loads
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map || !track || track.lons.length < 2) return;

    const lons = track.lons;
    const lats = track.lats;
    let minLon = Infinity,
      maxLon = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;
    for (let i = 0; i < lons.length; i++) {
      const lon = lons[i]!;
      const lat = lats[i]!;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 60, duration: 1000 },
    );
  }, [mapRef, track]);

  // Build GeoJSON LineString from track
  const trackLineString = useMemo((): GeoJSON.Feature<GeoJSON.LineString> | null => {
    if (!track || track.lons.length < 2) return null;
    const coordinates: number[][] = [];
    for (let i = 0; i < track.lons.length; i++) {
      const coord: number[] = [track.lons[i]!, track.lats[i]!];
      const alt = track.alts[i];
      if (alt != null) coord.push(alt);
      coordinates.push(coord);
    }
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    };
  }, [track]);

  // Interpolated aircraft position
  const currentPos = useMemo(() => {
    if (!track) return null;
    return interpolateTrack(progress, track.lons, track.lats, track.alts);
  }, [track, progress]);

  // Aircraft marker GeoJSON
  const markerGeoJson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!currentPos) return null;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [currentPos.lon, currentPos.lat],
          },
          properties: {
            bearing: currentPos.bearing,
          },
        },
      ],
    };
  }, [currentPos]);

  // Animation loop
  useEffect(() => {
    if (!playing || !track) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Base replay: track replays in ~30 seconds at 1x
    const baseDuration = 30_000;

    const animate = (ts: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = ts;
      const dt = ts - lastFrameRef.current;
      lastFrameRef.current = ts;

      const increment = (dt / baseDuration) * speed;
      const newProgress = Math.min(1, progressRef.current + increment);
      setProgress(newProgress);

      if (newProgress >= 1) {
        setPlaying(false);
        return;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, track, speed]);

  const handlePlayPause = useCallback(() => {
    if (progress >= 1) {
      setProgress(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [progress]);

  const handleProgressChange = useCallback((p: number) => {
    setProgress(p);
    setPlaying(false);
  }, []);

  const markerLayerSpec: SymbolLayerSpecification = useMemo(
    () => ({
      id: 'replay-aircraft',
      type: 'symbol',
      source: 'replay-aircraft-source',
      layout: {
        'icon-image': 'airplane',
        'icon-size': 0.7,
        'icon-rotate': ['coalesce', ['get', 'bearing'], 0],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
      },
      paint: {
        'icon-color': '#f59e0b',
      },
    }),
    [],
  );

  // Loading state
  if (trackQuery.isLoading) {
    return (
      <div
        style={{
          height: '100vh',
          background: '#0a0a0a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Loading track for {tailNumber}...
      </div>
    );
  }

  // No track data
  if (!track || track.lons.length < 2) {
    return (
      <div
        style={{
          height: '100vh',
          background: '#0a0a0a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ccc',
          fontFamily: 'system-ui, sans-serif',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 18 }}>No recent flight data for {tailNumber}</div>
        <Link
          href="/fleet-map"
          style={{
            color: '#3b82f6',
            textDecoration: 'underline',
            fontSize: 14,
          }}
        >
          Back to Fleet Map
        </Link>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', position: 'relative', background: '#0a0a0a' }}>
      {/* Header bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          background: 'rgba(15, 15, 25, 0.92)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <Link
          href="/fleet-map"
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          &larr; Fleet Map
        </Link>
        <div style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600 }}>
          Track Replay: {tailNumber}
        </div>
      </div>

      {/* Planned route overlay */}
      {plannedRoute && <PlannedRouteOverlay routeString={plannedRoute} />}

      {/* Map */}
      <Map
        id="replayMap"
        mapStyle={MAP_STYLE}
        initialViewState={{
          longitude: -98.5,
          latitude: 39.8,
          zoom: 4,
        }}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        <NavigationControl position="top-right" />

        {/* Graduated track polyline */}
        {trackLineString && <ReplayTrackLayer trackLineString={trackLineString} />}

        {/* Animated aircraft marker */}
        {iconLoaded && markerGeoJson && (
          <Source id="replay-aircraft-source" type="geojson" data={markerGeoJson}>
            <Layer {...markerLayerSpec} />
          </Source>
        )}
      </Map>

      {/* Playback controls */}
      <ReplayControls
        progress={progress}
        playing={playing}
        speed={speed}
        firstSeen={track.firstSeen}
        lastSeen={track.lastSeen}
        currentAltitude={currentPos?.alt ?? null}
        onProgressChange={handleProgressChange}
        onPlayPause={handlePlayPause}
        onSpeedChange={setSpeed}
      />
    </div>
  );
}

export default function ReplayClient({ tailNumber }: { tailNumber: string }) {
  return (
    <MapProvider>
      <ReplayInner tailNumber={tailNumber} />
    </MapProvider>
  );
}
