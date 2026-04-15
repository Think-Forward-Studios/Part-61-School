'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import MapGL, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import { DeckGLOverlay } from './DeckGLOverlay';
import { ScatterplotLayer, PathLayer, IconLayer, PolygonLayer, TextLayer } from '@deck.gl/layers';
import { useQuery } from '@tanstack/react-query';
import {
  fetchWaypoints,
  fetchAirports,
  fetchNavaids,
  fetchStates,
  fetchSwimLatest,
  fetchSwimTracks,
  fetchSwimStats,
  type BBox,
  type Waypoint,
  type Airport,
  type Navaid,
  type AircraftState,
  type AircraftTrack,
} from '@/lib/adsb-api';
import ControlPanel from './ControlPanel';
import FilterPanel, { type Filters } from './FilterPanel';
import HomeAirportPanel from './HomeAirportPanel';

// Initial view: centered on Alabama at a state-level zoom.
// TODO: replace with the school's primary base lat/lon once the admin
// schema surfaces it (tracked for Phase 8 polish).
const INITIAL_VIEW = {
  latitude: 32.8,
  longitude: -86.8,
  zoom: 6.5,
  pitch: 0,
  bearing: 0,
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: 'raster' as const,
      tiles: [
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'USGS National Map',
      maxzoom: 16,
    },
  },
  layers: [{ id: 'satellite', type: 'raster' as const, source: 'satellite' }],
};

interface TooltipInfo {
  x: number;
  y: number;
  content: React.ReactNode;
}

interface LayerVisibility {
  waypoints: boolean;
  airports: boolean;
  navaids: boolean;
  aircraft: boolean;
  tracks: boolean;
  weather: boolean;
}

const NM_TO_DEG_LAT = 1 / 60;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildRingPolygon(lat: number, lon: number, radiusNm: number, steps = 120): number[][] {
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = radiusNm * NM_TO_DEG_LAT * Math.cos(angle);
    const dLon = radiusNm * NM_TO_DEG_LAT * (1 / Math.cos((lat * Math.PI) / 180)) * Math.sin(angle);
    ring.push([lon + dLon, lat + dLat]);
  }
  return ring;
}

// Known helicopter ICAO type designators
const HELICOPTER_TYPES = new Set([
  'R22',
  'R44',
  'R66',
  'R88',
  'B06',
  'B07',
  'B47',
  'B212',
  'B214',
  'B222',
  'B230',
  'B427',
  'B429',
  'B505',
  'B525',
  'EC20',
  'EC25',
  'EC30',
  'EC35',
  'EC45',
  'EC55',
  'EC65',
  'EC75',
  'EC80',
  'H120',
  'H125',
  'H130',
  'H135',
  'H145',
  'H155',
  'H160',
  'H175',
  'H215',
  'H225',
  'S300',
  'S330',
  'S333',
  'S55',
  'S58',
  'S61',
  'S64',
  'S70',
  'S76',
  'S92',
  'S97',
  'H47',
  'H53',
  'H60',
  'H64',
  'UH60',
  'CH47',
  'CH53',
  'MH60',
  'MD50',
  'MD52',
  'MD60',
  'A109',
  'A119',
  'A169',
  'A189',
  'E280',
  'E480',
  'S269',
]);

function isHelicopter(acType?: string): boolean {
  if (!acType) return false;
  return HELICOPTER_TYPES.has(acType.toUpperCase());
}

function createPlaneIcon(): string {
  if (typeof document === 'undefined') return '';
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const cx = size / 2;
  ctx.fillStyle = '#ffffff';
  // Fuselage
  ctx.beginPath();
  ctx.ellipse(cx, cx, 4, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nose cone
  ctx.beginPath();
  ctx.moveTo(cx, 2);
  ctx.lineTo(cx - 3, 12);
  ctx.lineTo(cx + 3, 12);
  ctx.closePath();
  ctx.fill();
  // Wings (wide swept)
  ctx.beginPath();
  ctx.moveTo(cx, 20);
  ctx.lineTo(cx - 28, 38);
  ctx.lineTo(cx - 14, 38);
  ctx.lineTo(cx, 28);
  ctx.lineTo(cx + 14, 38);
  ctx.lineTo(cx + 28, 38);
  ctx.closePath();
  ctx.fill();
  // Tail fins
  ctx.beginPath();
  ctx.moveTo(cx, 48);
  ctx.lineTo(cx - 14, 60);
  ctx.lineTo(cx - 6, 58);
  ctx.lineTo(cx, 52);
  ctx.lineTo(cx + 6, 58);
  ctx.lineTo(cx + 14, 60);
  ctx.closePath();
  ctx.fill();
  return canvas.toDataURL();
}

function createHelicopterIcon(): string {
  if (typeof document === 'undefined') return '';
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const cx = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  // Main rotor disc (circle)
  ctx.beginPath();
  ctx.arc(cx, 22, 20, 0, Math.PI * 2);
  ctx.stroke();
  // Rotor blades (cross)
  ctx.beginPath();
  ctx.moveTo(cx - 20, 22);
  ctx.lineTo(cx + 20, 22);
  ctx.moveTo(cx, 2);
  ctx.lineTo(cx, 42);
  ctx.stroke();
  // Fuselage blob
  ctx.beginPath();
  ctx.ellipse(cx, 38, 8, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail boom
  ctx.beginPath();
  ctx.moveTo(cx, 50);
  ctx.lineTo(cx, 62);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Tail rotor
  ctx.beginPath();
  ctx.moveTo(cx - 6, 62);
  ctx.lineTo(cx + 6, 62);
  ctx.stroke();
  return canvas.toDataURL();
}

/** Dead-reckon an aircraft position forward from its last known fix. */
function deadReckon(
  lat: number,
  lon: number,
  velocityMs: number | undefined,
  headingDeg: number | undefined,
  apiTime: number | undefined,
): [number, number] {
  if (!velocityMs || !headingDeg || !apiTime) return [lon, lat];
  const elapsed = Math.min(Date.now() / 1000 - apiTime, 60); // cap at 60s
  if (elapsed <= 0) return [lon, lat];
  const headingRad = (headingDeg * Math.PI) / 180;
  const distM = velocityMs * elapsed;
  const dLat = (distM * Math.cos(headingRad)) / 111111;
  const dLon = (distM * Math.sin(headingRad)) / (111111 * Math.cos((lat * Math.PI) / 180));
  return [lon + dLon, lat + dLat];
}

function getBBoxFromViewState(viewState: {
  latitude: number;
  longitude: number;
  zoom: number;
}): BBox {
  const latRange = 180 / Math.pow(2, viewState.zoom);
  const lonRange = 360 / Math.pow(2, viewState.zoom);
  return {
    latMin: viewState.latitude - latRange,
    lonMin: viewState.longitude - lonRange,
    latMax: viewState.latitude + latRange,
    lonMax: viewState.longitude + lonRange,
  };
}

export interface FleetAircraft {
  id: string;
  tailNumber: string;
}

export interface LiveMapViewProps {
  fleetAircraft?: FleetAircraft[];
}

function normalizeTail(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().toUpperCase().replace(/^N/, '');
}

export default function LiveMapView({ fleetAircraft = [] }: LiveMapViewProps) {
  const fleetTailSet = useMemo(
    () => new Set(fleetAircraft.map((ac) => normalizeTail(ac.tailNumber))),
    [fleetAircraft],
  );
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [selectedIcao24, setSelectedIcao24] = useState<string | null>(null);
  const [selectedCallsign, setSelectedCallsign] = useState<string | null>(null);
  const [selectedFlightInfo, setSelectedFlightInfo] = useState<{
    ac_type?: string;
    airport?: string;
    entry_fix?: string;
    exit_fix?: string;
    flight_rules?: string;
    flight_type?: string;
  } | null>(null);
  const [filters, setFilters] = useState<Filters>({
    icao24: '',
    callsign: '',
    altMin: null,
    altMax: null,
  });
  const [layers, setLayers] = useState<LayerVisibility>({
    waypoints: false,
    airports: true,
    navaids: false,
    tracks: true,
    aircraft: true,
    weather: false,
  });
  const [satellite, setSatellite] = useState(false);
  const [homeAirport, setHomeAirport] = useState<Airport | null>(null);
  const [homeRadiusNm, setHomeRadiusNm] = useState(250);
  const [planeIconUrl] = useState(() => createPlaneIcon());
  const [heloIconUrl] = useState(() => createHelicopterIcon());
  const [dataRevision, setDataRevision] = useState(0);
  const [animTick, setAnimTick] = useState(0);

  const [viewportBBox, setViewportBBox] = useState<BBox>(() => getBBoxFromViewState(INITIAL_VIEW));
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onViewStateChange = useCallback((evt: { viewState: typeof INITIAL_VIEW }) => {
    setViewState(evt.viewState);
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => {
      setViewportBBox(getBBoxFromViewState(evt.viewState));
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
    };
  }, []);

  // 1-second animation tick for dead-reckoning position interpolation
  useEffect(() => {
    const id = setInterval(() => setAnimTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // When home airport is set, lock the fetch bbox to the airport + radius
  // so real-time data always covers the selected area regardless of map pan
  const fetchBBox = useMemo<BBox>(() => {
    if (homeAirport) {
      const degLat = homeRadiusNm / 60;
      const degLon = homeRadiusNm / 60 / Math.cos((homeAirport.latitude * Math.PI) / 180);
      return {
        latMin: homeAirport.latitude - degLat,
        latMax: homeAirport.latitude + degLat,
        lonMin: homeAirport.longitude - degLon,
        lonMax: homeAirport.longitude + degLon,
      };
    }
    return viewportBBox;
  }, [homeAirport, homeRadiusNm, viewportBBox]);

  // SWIM live data — refresh every 5 seconds
  const swimLatestQuery = useQuery({
    queryKey: ['swim-latest', fetchBBox],
    queryFn: async () => {
      const data = await fetchSwimLatest(fetchBBox, 5);
      setDataRevision((r) => r + 1);
      return data;
    },
    enabled: layers.aircraft,
    refetchInterval: 5_000,
    structuralSharing: false,
  });

  // OpenSky /states feed — raw ADS-B from the community receiver network.
  // SWIM is FAA-correlated and tends to drop uncorrelated VFR traffic
  // (pattern work, practice areas, no flight plan), so we union in the
  // raw ADS-B view so school aircraft doing VFR practice stay visible.
  // SWIM-vs-OpenSky de-duplication happens in the merge below, keyed
  // on ICAO24 with the fresher api_time winning.
  const statesQuery = useQuery({
    queryKey: ['states', fetchBBox],
    queryFn: async () => {
      const data = await fetchStates(fetchBBox);
      setDataRevision((r) => r + 1);
      return data;
    },
    enabled: layers.aircraft,
    refetchInterval: 5_000,
    structuralSharing: false,
  });

  // SWIM tracks — refresh every 15 seconds
  const swimTracksQuery = useQuery({
    queryKey: ['swim-tracks', fetchBBox],
    queryFn: async () => {
      const data = await fetchSwimTracks(fetchBBox, 30);
      setDataRevision((r) => r + 1);
      return data;
    },
    enabled: layers.tracks,
    refetchInterval: 15_000,
    structuralSharing: false,
  });

  // SWIM stats — refresh every 30 seconds
  const swimStatsQuery = useQuery({
    queryKey: ['swim-stats'],
    queryFn: fetchSwimStats,
    refetchInterval: 30_000,
  });

  // OpenWeatherMap radar — 1-hour loop using 10-min intervals (OWM is not weather.gov)
  const OWM_KEY = process.env.NEXT_PUBLIC_OWM_KEY;

  // Build 7 frames covering the past ~60 minutes at 10-min steps
  const radarFrames = useMemo(() => {
    if (!OWM_KEY) return [];
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: 7 }, (_, i) => ({
      time: now - (6 - i) * 600, // -60min → now
    }));
  }, [OWM_KEY]);

  const [radarFrame, setRadarFrame] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(true);

  // Clamp frame when frames change
  useEffect(() => {
    if (radarFrames.length > 0) setRadarFrame((f) => Math.min(f, radarFrames.length - 1));
  }, [radarFrames.length]);

  // Animation loop — advance frame every 600ms
  useEffect(() => {
    if (!radarPlaying || radarFrames.length === 0) return;
    const id = setInterval(() => setRadarFrame((f) => (f + 1) % radarFrames.length), 600);
    return () => clearInterval(id);
  }, [radarPlaying, radarFrames.length]);

  // Reference data
  const waypointsQuery = useQuery({
    queryKey: ['waypoints', viewportBBox],
    queryFn: () => fetchWaypoints(viewportBBox),
    enabled: layers.waypoints && viewState.zoom > 7,
    placeholderData: (prev) => prev,
  });

  const airportsQuery = useQuery({
    queryKey: ['airports', viewportBBox],
    queryFn: () => fetchAirports(viewportBBox),
    enabled: layers.airports,
    placeholderData: (prev) => prev,
  });

  const navaidsQuery = useQuery({
    queryKey: ['navaids', viewportBBox],
    queryFn: () => fetchNavaids(viewportBBox),
    enabled: layers.navaids && viewState.zoom > 6,
    placeholderData: (prev) => prev,
  });

  const handleMapClick = useCallback(() => {
    setSelectedIcao24(null);
    setSelectedCallsign(null);
    setSelectedFlightInfo(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'x' || e.key === 'X') {
        setSelectedIcao24(null);
        setSelectedCallsign(null);
        setSelectedFlightInfo(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Union SWIM (FAA-correlated) + OpenSky /states (raw ADS-B) so VFR
  // aircraft that aren't correlated in SWIM (pattern work, practice
  // areas, no flight plan) still show on the map. De-dupe by ICAO24
  // with the fresher api_time winning — so a stale SWIM fix doesn't
  // override a newer ADS-B fix and vice versa.
  const mergedStates = useMemo<AircraftState[]>(() => {
    const byIcao = new Map<string, AircraftState>();
    const ingest = (arr: readonly AircraftState[] | undefined) => {
      if (!arr) return;
      for (const d of arr) {
        if (!d.icao24) continue;
        const existing = byIcao.get(d.icao24);
        if (!existing) {
          byIcao.set(d.icao24, d);
          continue;
        }
        const existingT = existing.api_time ?? 0;
        const incomingT = d.api_time ?? 0;
        if (incomingT > existingT) {
          // Keep flight-plan fields from the older record if the newer
          // one lacks them (OpenSky doesn't carry TAIS data).
          byIcao.set(d.icao24, {
            ...existing,
            ...d,
            ac_type: d.ac_type ?? existing.ac_type,
            airport: d.airport ?? existing.airport,
            entry_fix: d.entry_fix ?? existing.entry_fix,
            exit_fix: d.exit_fix ?? existing.exit_fix,
            flight_rules: d.flight_rules ?? existing.flight_rules,
            flight_type: d.flight_type ?? existing.flight_type,
          });
        }
      }
    };
    ingest(swimLatestQuery.data);
    ingest(statesQuery.data);
    return Array.from(byIcao.values());
  }, [swimLatestQuery.data, statesQuery.data]);

  // Filter aircraft data — home airport radius is the primary filter when set
  const filteredStates = useMemo(() => {
    if (mergedStates.length === 0) return [];
    let data = mergedStates;
    if (homeAirport) {
      data = data.filter(
        (d) =>
          haversineNm(homeAirport.latitude, homeAirport.longitude, d.latitude, d.longitude) <=
          homeRadiusNm,
      );
    }
    if (filters.icao24) data = data.filter((d) => d.icao24.includes(filters.icao24));
    if (filters.callsign)
      data = data.filter((d) => (d.callsign || '').toUpperCase().includes(filters.callsign));
    if (filters.altMin != null) {
      const minM = filters.altMin / 3.281;
      data = data.filter((d) => d.baro_altitude != null && d.baro_altitude >= minM);
    }
    if (filters.altMax != null) {
      const maxM = filters.altMax / 3.281;
      data = data.filter((d) => d.baro_altitude != null && d.baro_altitude <= maxM);
    }
    return data;
  }, [mergedStates, filters, homeAirport, homeRadiusNm]);

  const filteredTracks = useMemo(() => {
    if (!swimTracksQuery.data) return [];
    let data = swimTracksQuery.data;
    if (homeAirport) {
      data = data.filter((d) => {
        const midLat = d.lats[Math.floor(d.lats.length / 2)];
        const midLon = d.lons[Math.floor(d.lons.length / 2)];
        if (midLat === undefined || midLon === undefined) return false;
        return (
          haversineNm(homeAirport.latitude, homeAirport.longitude, midLat, midLon) <= homeRadiusNm
        );
      });
    }
    if (filters.icao24) data = data.filter((d) => d.icao24.includes(filters.icao24));
    if (filters.callsign)
      data = data.filter((d) => (d.callsign || '').toUpperCase().includes(filters.callsign));

    // Build a lookup of latest live positions so track endpoints match
    // arrow positions. Uses the merged (SWIM + OpenSky) view so ADS-B-
    // only aircraft also get their trail extended to the current fix.
    const livePositions = new Map(mergedStates.map((s) => [s.icao24, s]));

    // Extend each track's last point to the current live position if available
    return data.map((track) => {
      const live = livePositions.get(track.icao24);
      if (!live) return track;
      const lastLon = track.lons[track.lons.length - 1];
      const lastLat = track.lats[track.lats.length - 1];
      if (lastLon === undefined || lastLat === undefined) return track;
      // Only append if the live position is meaningfully different from track end
      if (Math.abs(live.longitude - lastLon) < 0.0001 && Math.abs(live.latitude - lastLat) < 0.0001)
        return track;
      return {
        ...track,
        lons: [...track.lons, live.longitude],
        lats: [...track.lats, live.latitude],
        alts: [...track.alts, live.baro_altitude ?? null],
      };
    });
  }, [swimTracksQuery.data, mergedStates, filters, homeAirport, homeRadiusNm]);

  const handleHover = useCallback(
    (info: { object?: unknown; x?: number; y?: number; layer?: { id?: string } }) => {
      if (!info.object || info.x == null || info.y == null) {
        setTooltip(null);
        return;
      }

      const layerId = info.layer?.id || '';
      let content: React.ReactNode = null;

      if (layerId === 'waypoints-layer') {
        const d = info.object as Waypoint;
        content = (
          <>
            <div className="tooltip-title">FIX / WAYPOINT</div>
            <div className="tooltip-row">
              <span className="tooltip-label">ID</span>
              <span className="tooltip-value">{d.fix_id}</span>
            </div>
          </>
        );
      } else if (layerId === 'airports-layer') {
        const d = info.object as Airport;
        content = (
          <>
            <div className="tooltip-title">{d.icao_id || d.location_id}</div>
            <div className="tooltip-row">
              <span className="tooltip-label">Name</span>
              <span className="tooltip-value">{d.name}</span>
            </div>
            {d.city && (
              <div className="tooltip-row">
                <span className="tooltip-label">Location</span>
                <span className="tooltip-value">
                  {d.city}, {d.state_code}
                </span>
              </div>
            )}
          </>
        );
      } else if (layerId === 'navaids-layer') {
        const d = info.object as Navaid;
        content = (
          <>
            <div className="tooltip-title">NAVAID</div>
            <div className="tooltip-row">
              <span className="tooltip-label">ID</span>
              <span className="tooltip-value">{d.nav_id}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Type</span>
              <span className="tooltip-value">{d.nav_type}</span>
            </div>
          </>
        );
      } else if (layerId === 'aircraft-layer' || layerId === 'aircraft-arrows-layer') {
        const d = info.object as AircraftState;
        content = (
          <>
            <div className="tooltip-title">{d.callsign?.trim() || d.icao24}</div>
            <div className="tooltip-row">
              <span className="tooltip-label">ICAO24</span>
              <span className="tooltip-value">{d.icao24}</span>
            </div>
            {d.callsign && (
              <div className="tooltip-row">
                <span className="tooltip-label">Callsign</span>
                <span className="tooltip-value">{d.callsign.trim()}</span>
              </div>
            )}
            {d.baro_altitude != null && (
              <div className="tooltip-row">
                <span className="tooltip-label">Altitude</span>
                <span className="tooltip-value">
                  {Math.round(d.baro_altitude * 3.281).toLocaleString()} ft
                </span>
              </div>
            )}
            {d.velocity != null && (
              <div className="tooltip-row">
                <span className="tooltip-label">Speed</span>
                <span className="tooltip-value">{Math.round(d.velocity * 1.944)} kts</span>
              </div>
            )}
            {d.true_track != null && (
              <div className="tooltip-row">
                <span className="tooltip-label">Track</span>
                <span className="tooltip-value">{Math.round(d.true_track)}&deg;</span>
              </div>
            )}
            {d.ac_type && (
              <div className="tooltip-row">
                <span className="tooltip-label">Aircraft</span>
                <span className="tooltip-value">{d.ac_type}</span>
              </div>
            )}
            {d.airport && (
              <div className="tooltip-row">
                <span className="tooltip-label">
                  {d.flight_type === 'A'
                    ? 'Arriving'
                    : d.flight_type === 'P'
                      ? 'Departing'
                      : 'Airport'}
                </span>
                <span className="tooltip-value">{d.airport}</span>
              </div>
            )}
            {d.entry_fix && d.exit_fix && (
              <div className="tooltip-row">
                <span className="tooltip-label">Route</span>
                <span className="tooltip-value">
                  {d.entry_fix} → {d.exit_fix}
                </span>
              </div>
            )}
            {d.flight_rules && (
              <div className="tooltip-row">
                <span className="tooltip-label">Rules</span>
                <span className="tooltip-value">{d.flight_rules}</span>
              </div>
            )}
            {d.squawk && (
              <div className="tooltip-row">
                <span className="tooltip-label">Squawk</span>
                <span className="tooltip-value">{d.squawk}</span>
              </div>
            )}
            <div className="tooltip-row">
              <span className="tooltip-label">Source</span>
              <span className="tooltip-value" style={{ color: '#00e5ff' }}>
                FAA SWIM
              </span>
            </div>
          </>
        );
      }

      if (content) {
        setTooltip({ x: info.x, y: info.y, content });
      }
    },
    [],
  );

  const handleClick = useCallback(
    (info: any) => {
      if (!info.object) return;
      const layerId = info.layer?.id || '';
      if (
        layerId === 'tracks-layer' ||
        layerId === 'aircraft-layer' ||
        layerId === 'aircraft-arrows-layer'
      ) {
        const d = info.object as AircraftState & AircraftTrack;
        const deselecting = selectedIcao24 === d.icao24;
        setSelectedIcao24(deselecting ? null : d.icao24);
        setSelectedCallsign(deselecting ? null : d.callsign?.trim() || null);
        setSelectedFlightInfo(
          deselecting
            ? null
            : {
                ac_type: d.ac_type,
                airport: d.airport,
                entry_fix: d.entry_fix,
                exit_fix: d.exit_fix,
                flight_rules: d.flight_rules,
                flight_type: d.flight_type,
              },
        );
      }
    },
    [selectedIcao24],
  );

  // Stats for HomeAirportPanel — same as filteredStates/Tracks since radius is applied there
  const homeRadiusStates = filteredStates;
  const homeRadiusTracks = filteredTracks;

  // Build deck.gl layers
  const deckLayers = useMemo(() => {
    const result: any[] = [];

    if (layers.airports && airportsQuery.data) {
      result.push(
        new ScatterplotLayer<Airport>({
          id: 'airports-layer',
          data: airportsQuery.data,
          getPosition: (d) => [d.longitude, d.latitude],
          getFillColor: [0, 230, 118, 220],
          getRadius: 4,
          radiusMinPixels: 3,
          radiusMaxPixels: 10,
          pickable: true,
          stroked: true,
          getLineColor: [0, 230, 118, 80],
          lineWidthMinPixels: 1,
        }),
      );
    }

    if (layers.navaids && navaidsQuery.data && viewState.zoom > 6) {
      result.push(
        new ScatterplotLayer<Navaid>({
          id: 'navaids-layer',
          data: navaidsQuery.data,
          getPosition: (d) => [d.longitude, d.latitude],
          getFillColor: [255, 145, 0, 200],
          getRadius: 3,
          radiusMinPixels: 2,
          radiusMaxPixels: 8,
          pickable: true,
          stroked: true,
          getLineColor: [255, 145, 0, 60],
          lineWidthMinPixels: 1,
        }),
      );
    }

    if (layers.waypoints && waypointsQuery.data && viewState.zoom > 7) {
      result.push(
        new ScatterplotLayer<Waypoint>({
          id: 'waypoints-layer',
          data: waypointsQuery.data,
          getPosition: (d) => [d.longitude, d.latitude],
          getFillColor: [0, 229, 255, 160],
          getRadius: 2,
          radiusMinPixels: 1.5,
          radiusMaxPixels: 5,
          pickable: true,
        }),
      );
    }

    if (layers.tracks && filteredTracks.length > 0) {
      result.push(
        new PathLayer<AircraftTrack>({
          id: 'tracks-layer',
          data: filteredTracks,
          getPath: (d) =>
            d.lons.map((lon: number, i: number) => [lon, d.lats[i], d.alts[i] ?? 0]) as unknown as [
              number,
              number,
            ][],
          getColor: (d) => {
            const isSelected = selectedIcao24 === d.icao24;
            const isDimmed = selectedIcao24 != null && !isSelected;
            if (isDimmed) return [80, 80, 80, 40];
            if (isSelected) return [255, 255, 255, 255];
            const alt = d.max_altitude ?? 0;
            if (alt < 3000) return [0, 255, 100, 180];
            if (alt < 10000) return [0, 200, 255, 180];
            return [200, 100, 255, 180];
          },
          getWidth: (d) => {
            if (selectedIcao24 === d.icao24) return 4;
            if (selectedIcao24 != null) return 1;
            return 2;
          },
          widthMinPixels: 1,
          widthMaxPixels: 6,
          pickable: true,
          jointRounded: true,
          capRounded: true,
          updateTriggers: {
            getColor: [selectedIcao24, dataRevision],
            getWidth: [selectedIcao24, dataRevision],
            getPath: dataRevision,
          },
        }),
      );
    }

    if (layers.aircraft && filteredStates.length > 0) {
      result.push(
        new IconLayer<AircraftState>({
          id: 'aircraft-layer',
          data: filteredStates,
          getPosition: (d) => {
            const [lon, lat] = deadReckon(
              d.latitude,
              d.longitude,
              d.velocity,
              d.true_track,
              d.api_time,
            );
            return [lon, lat, d.baro_altitude ?? 0];
          },
          getIcon: (d) => {
            const url = isHelicopter(d.ac_type) ? heloIconUrl : planeIconUrl;
            return { url, width: 64, height: 64, anchorY: 32 };
          },
          getSize: (d) => {
            const isSchoolAc = fleetTailSet.has(normalizeTail(d.callsign));
            if (selectedIcao24 === d.icao24) return 32;
            if (selectedIcao24 != null) return 14;
            // School fleet aircraft render much larger than surrounding
            // traffic so the airplane silhouette is unambiguous even at
            // state-wide zoom. Non-fleet aircraft stay at 20 so they
            // don't clutter the map.
            return isSchoolAc ? 40 : 20;
          },
          getAngle: (d) => -(d.true_track ?? 0),
          getColor: (d) => {
            const isSelected = selectedIcao24 === d.icao24;
            const isDimmed = selectedIcao24 != null && !isSelected;
            if (isDimmed) return [80, 80, 80, 60];
            if (isSelected) return [255, 255, 255, 255];
            // School fleet aircraft ignore the altitude-based palette
            // and render in a distinctive bright orange so they're
            // identifiable at a glance among all other traffic.
            if (fleetTailSet.has(normalizeTail(d.callsign))) {
              return [255, 145, 0, 255];
            }
            const altFt = (d.baro_altitude ?? 0) * 3.281;
            if (altFt < 10000) return [0, 255, 100, 230];
            if (altFt < 33000) return [0, 200, 255, 230];
            return [200, 100, 255, 230];
          },
          sizeScale: 1,
          sizeMinPixels: 10,
          sizeMaxPixels: 48,
          pickable: true,
          billboard: false,
          updateTriggers: {
            getColor: [selectedIcao24, dataRevision, fleetTailSet],
            getSize: [selectedIcao24, dataRevision, fleetTailSet],
            getPosition: [dataRevision, animTick],
            getIcon: dataRevision,
          },
        }),
      );

      // School-fleet tail labels so each fleet aircraft is identifiable
      // by name even at wide zoom. The icon itself is already tinted
      // orange + upsized in the IconLayer above; this layer adds a
      // small tail-number callout floating above it. Only shown when
      // no single aircraft is being tracked (so selection dimming stays
      // clean).
      if (fleetTailSet.size > 0 && selectedIcao24 == null) {
        const schoolPositions = filteredStates.filter((d) =>
          fleetTailSet.has(normalizeTail(d.callsign)),
        );
        if (schoolPositions.length > 0) {
          result.push(
            new TextLayer<AircraftState>({
              id: 'school-fleet-label',
              data: schoolPositions,
              getPosition: (d) => {
                const [lon, lat] = deadReckon(
                  d.latitude,
                  d.longitude,
                  d.velocity,
                  d.true_track,
                  d.api_time,
                );
                return [lon, lat, (d.baro_altitude ?? 0) + 1];
              },
              getText: (d) => (d.callsign ?? '').trim(),
              getSize: 12,
              getColor: [255, 200, 100, 255],
              getPixelOffset: [0, -32],
              getTextAnchor: 'middle',
              getAlignmentBaseline: 'bottom',
              fontFamily: 'Menlo, "Courier New", monospace',
              fontWeight: 700,
              outlineWidth: 3,
              outlineColor: [0, 0, 0, 230],
              fontSettings: { sdf: true },
              background: false,
              pickable: false,
              updateTriggers: {
                getPosition: [dataRevision, animTick],
              },
            }),
          );
        }
      }
    }

    // Home airport radius ring + filtered traffic
    if (homeAirport) {
      result.push(
        new PolygonLayer({
          id: 'home-radius-ring',
          data: [
            {
              polygon: buildRingPolygon(homeAirport.latitude, homeAirport.longitude, homeRadiusNm),
            },
          ],
          getPolygon: (d: { polygon: number[][] }) => d.polygon,
          getFillColor: [255, 200, 0, 8],
          getLineColor: [255, 200, 0, 160],
          lineWidthMinPixels: 1.5,
          stroked: true,
          filled: true,
          pickable: false,
        }),
      );
      result.push(
        new ScatterplotLayer({
          id: 'home-center',
          data: [homeAirport],
          getPosition: (d: Airport) => [d.longitude, d.latitude],
          getFillColor: [255, 200, 0, 240],
          getRadius: 6,
          radiusMinPixels: 6,
          radiusMaxPixels: 16,
          stroked: true,
          getLineColor: [255, 200, 0, 100],
          lineWidthMinPixels: 2,
          pickable: false,
        }),
      );
    }

    return result;
  }, [
    layers,
    selectedIcao24,
    dataRevision,
    animTick,
    waypointsQuery.data,
    airportsQuery.data,
    navaidsQuery.data,
    filteredStates,
    filteredTracks,
    homeAirport,
    homeRadiusNm,
    viewState.zoom,
    planeIconUrl,
    heloIconUrl,
    fleetTailSet,
  ]);

  const toggleLayer = useCallback((key: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const counts = useMemo(
    () => ({
      waypoints: layers.waypoints && viewState.zoom > 7 ? (waypointsQuery.data?.length ?? 0) : 0,
      airports: layers.airports ? (airportsQuery.data?.length ?? 0) : 0,
      navaids: layers.navaids && viewState.zoom > 6 ? (navaidsQuery.data?.length ?? 0) : 0,
      aircraft: layers.aircraft ? filteredStates.length : 0,
      weather: 0,
      tracks: layers.tracks ? filteredTracks.length : 0,
    }),
    [
      layers,
      viewState.zoom,
      waypointsQuery.data,
      airportsQuery.data,
      navaidsQuery.data,
      filteredStates,
      filteredTracks,
    ],
  );

  const isLoading =
    swimLatestQuery.isFetching || swimTracksQuery.isFetching || airportsQuery.isFetching;

  const stats = swimStatsQuery.data;

  return (
    <div className="relative h-full w-full">
      {/* Header bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0aee] to-transparent px-4 py-2">
        <div className="pointer-events-auto flex items-center gap-3">
          <div
            className="h-2 w-2 rounded-full bg-[#00e5ff]"
            style={{
              boxShadow: '0 0 8px #00e5ff',
              animation: 'pulse 2s infinite',
            }}
          />
          <h1 className="text-sm font-semibold uppercase tracking-widest text-[#e0e0e0]">
            ADS-B Tracker
          </h1>
          <span className="font-mono text-[10px] tracking-wider text-[#00e5ff]">LIVE</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          {selectedIcao24 && (
            <button
              onClick={() => {
                setSelectedIcao24(null);
                setSelectedCallsign(null);
                setSelectedFlightInfo(null);
              }}
              className="flex items-center gap-2 rounded px-2 py-1 font-mono text-[10px] tracking-wider"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
              }}
            >
              TRACKING: {selectedCallsign || selectedIcao24.toUpperCase()}
              {selectedCallsign && <span style={{ color: '#888' }}> ({selectedIcao24})</span>}
              {selectedFlightInfo?.ac_type && (
                <span style={{ color: '#00e5ff' }}> {selectedFlightInfo.ac_type}</span>
              )}
              {selectedFlightInfo?.airport && (
                <span style={{ color: '#00e676' }}>
                  {' '}
                  {selectedFlightInfo.flight_type === 'A'
                    ? '→'
                    : selectedFlightInfo.flight_type === 'P'
                      ? '←'
                      : '@'}
                  {selectedFlightInfo.airport}
                </span>
              )}
              {selectedFlightInfo?.entry_fix && selectedFlightInfo?.exit_fix && (
                <span style={{ color: '#888' }}>
                  {' '}
                  {selectedFlightInfo.entry_fix}→{selectedFlightInfo.exit_fix}
                </span>
              )}
              <span style={{ color: '#666' }}>&#x2715;</span>
            </button>
          )}
          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00e5ff]" />
              <span className="font-mono text-[10px] tracking-wider text-[#555]">LOADING</span>
            </div>
          )}
          <button
            onClick={() => setSatellite((s) => !s)}
            className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] transition-all duration-200"
            style={{
              background: satellite ? 'rgba(255, 200, 0, 0.15)' : 'rgba(255,255,255,0.06)',
              border: satellite ? '1px solid rgba(255, 200, 0, 0.5)' : '1px solid #2a2a2a',
              color: satellite ? '#ffc800' : '#666',
            }}
          >
            {satellite ? 'SAT' : 'MAP'}
          </button>
          <span className="font-mono text-[10px] text-[#444]">
            Z{viewState.zoom.toFixed(1)} | {viewState.latitude.toFixed(2)},{' '}
            {viewState.longitude.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Map */}
      <MapGL
        id="fleetMap"
        {...viewState}
        onMove={onViewStateChange}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
        mapStyle={satellite ? SATELLITE_STYLE : MAP_STYLE}
        maxPitch={85}
        attributionControl={false}
      >
        {layers.weather &&
          OWM_KEY &&
          radarFrames.length > 0 &&
          (() => {
            const frame = radarFrames[radarFrame] ?? radarFrames[radarFrames.length - 1];
            if (!frame) return null;
            const tileUrl = `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_KEY}&date=${frame.time}`;
            return (
              <Source
                key={frame.time}
                id="radar"
                type="raster"
                tiles={[tileUrl]}
                tileSize={256}
                minzoom={0}
                maxzoom={18}
              >
                <Layer id="radar-layer" type="raster" paint={{ 'raster-opacity': 0.7 }} />
              </Source>
            );
          })()}
        <DeckGLOverlay layers={deckLayers} onHover={handleHover} onClick={handleClick} />
        <NavigationControl position="bottom-right" showCompass showZoom />
      </MapGL>

      {/* Tooltip */}
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}>
          {tooltip.content}
        </div>
      )}

      {/* Control panel */}
      <ControlPanel layers={layers} counts={counts} onToggle={toggleLayer} zoom={viewState.zoom} />

      {/* Filter panel */}
      <FilterPanel filters={filters} onFiltersChange={setFilters} />

      {/* SWIM Stats panel */}
      {stats && (
        <div
          className="absolute bottom-4 left-4 z-10 overflow-hidden rounded-lg"
          style={{
            background: 'rgba(17, 17, 17, 0.92)',
            border: '1px solid #1e1e1e',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            minWidth: '200px',
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              borderBottom: '1px solid #1e1e1e',
              background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.05), transparent)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#00e5ff]"
              style={{ boxShadow: '0 0 6px #00e5ff', animation: 'pulse 2s infinite' }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#888]">
              FAA SWIM Feed
            </span>
          </div>
          <div className="space-y-1.5 p-3">
            <div className="flex justify-between">
              <span className="font-mono text-[9px] text-[#666]">TOTAL POSITIONS</span>
              <span className="font-mono text-[10px] tabular-nums text-[#00e5ff]">
                {stats.total_positions?.toLocaleString() ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[9px] text-[#666]">AIRCRAFT TRACKED</span>
              <span className="font-mono text-[10px] tabular-nums text-[#ccc]">
                {stats.identified_aircraft?.toLocaleString() ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[9px] text-[#666]">WITH CALLSIGN</span>
              <span className="font-mono text-[10px] tabular-nums text-[#ccc]">
                {stats.with_callsign?.toLocaleString() ?? '—'}
              </span>
            </div>
            {stats.latest_time && (
              <div className="flex justify-between">
                <span className="font-mono text-[9px] text-[#666]">LAST UPDATE</span>
                <span className="font-mono text-[10px] tabular-nums text-[#ccc]">
                  {new Date(stats.latest_time * 1000).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Home Airport Panel */}
      <HomeAirportPanel
        homeAirport={homeAirport}
        radiusNm={homeRadiusNm}
        aircraftCount={homeRadiusStates.length}
        trackCount={homeRadiusTracks.length}
        callsignCount={homeRadiusStates.filter((d) => d.callsign).length}
        onAirportChange={setHomeAirport}
        onRadiusChange={setHomeRadiusNm}
      />

      {/* Radar — no key notice */}
      {layers.weather && !OWM_KEY && (
        <div
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg px-4 py-2 font-mono text-[11px]"
          style={{
            background: 'rgba(17,17,17,0.92)',
            border: '1px solid rgba(255,100,0,0.4)',
            color: '#ff6400',
          }}
        >
          Add NEXT_PUBLIC_OWM_KEY to .env (free at openweathermap.org)
        </div>
      )}

      {/* Radar playback controls */}
      {layers.weather && radarFrames.length > 0 && (
        <div
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: 'rgba(17,17,17,0.92)',
            border: '1px solid rgba(0,191,255,0.3)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {/* Play/Pause */}
          <button
            onClick={() => setRadarPlaying((p) => !p)}
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{
              color: '#00bfff',
              background: 'rgba(0,191,255,0.1)',
              border: '1px solid rgba(0,191,255,0.3)',
            }}
          >
            {radarPlaying ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="3" height="8" />
                <rect x="6" y="1" width="3" height="8" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="1,1 9,5 1,9" />
              </svg>
            )}
          </button>

          {/* Frame scrubber */}
          {radarFrames.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setRadarFrame(i);
                setRadarPlaying(false);
              }}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: radarFrame === i ? 20 : 8,
                background: radarFrame === i ? '#00bfff' : 'rgba(0,191,255,0.3)',
              }}
            />
          ))}

          {/* Timestamp */}
          <span
            className="font-mono text-[10px] tabular-nums"
            style={{ color: '#00bfff', minWidth: 42 }}
          >
            {radarFrames[radarFrame]
              ? new Date(radarFrames[radarFrame].time * 1000).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
              : '--:--'}
          </span>

          <span className="font-mono text-[9px] tracking-wider text-[#555]">NEXRAD</span>
        </div>
      )}

      {/* Scanline overlay */}
      <div className="scanline-overlay" />
    </div>
  );
}
