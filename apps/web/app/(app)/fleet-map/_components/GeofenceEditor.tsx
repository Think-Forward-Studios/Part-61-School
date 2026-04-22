'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { trpc } from '@/lib/trpc/client';

interface GeofenceEditorProps {
  geofence: {
    id: string;
    baseId: string;
    kind: string;
    geometry: unknown;
    radiusNm: string | null;
  } | null;
}

type DrawMode = 'polygon' | 'circle' | null;

/**
 * Admin-only geofence drawing tool.
 * Uses terra-draw with MapLibre GL adapter for polygon/circle drawing.
 * Only rendered when the user has admin role (the tRPC mutation will
 * reject non-admins anyway, so this is a UI convenience guard).
 */
export function GeofenceEditor({ geofence }: GeofenceEditorProps) {
  const { fleetMap: mapRef } = useMap();
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [drawnGeometry, setDrawnGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const drawRef = useRef<{
    terraDraw: unknown;
    cleanup: () => void;
  } | null>(null);

  const utils = trpc.useUtils();

  // Get the active base ID from the session for creating new geofences
  const sessionQuery = trpc.me.get.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const activeBaseId = geofence?.baseId ?? sessionQuery.data?.activeBaseId ?? null;

  const upsertMutation = trpc.admin.geofence.upsert.useMutation({
    onSuccess: () => {
      void utils.admin.geofence.getActive.invalidate();
      setMessage('Geofence saved');
      setDrawnGeometry(null);
      setDrawMode(null);
      cleanupDraw();
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (err) => {
      setMessage(`Error: ${err.message}`);
      setTimeout(() => setMessage(null), 5000);
    },
    onSettled: () => setSaving(false),
  });

  const deleteMutation = trpc.admin.geofence.softDelete.useMutation({
    onSuccess: () => {
      void utils.admin.geofence.getActive.invalidate();
      setMessage('Geofence deleted');
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (err) => {
      setMessage(`Error: ${err.message}`);
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const cleanupDraw = useCallback(() => {
    if (drawRef.current) {
      drawRef.current.cleanup();
      drawRef.current = null;
    }
  }, []);

  // Start drawing mode using terra-draw
  const startDraw = useCallback(
    async (mode: DrawMode) => {
      const map = mapRef?.getMap();
      if (!map || !mode) return;

      cleanupDraw();
      setDrawMode(mode);
      setDrawnGeometry(null);

      try {
        // Dynamic imports to avoid SSR issues
        const { TerraDraw, TerraDrawPolygonMode, TerraDrawCircleMode } = await import('terra-draw');
        const { TerraDrawMapLibreGLAdapter } = await import('terra-draw-maplibre-gl-adapter');

        const adapter = new TerraDrawMapLibreGLAdapter({ map });

        const modes =
          mode === 'polygon' ? [new TerraDrawPolygonMode()] : [new TerraDrawCircleMode()];

        const terraDraw = new TerraDraw({ adapter, modes });
        terraDraw.start();
        terraDraw.setMode(mode);

        terraDraw.on('finish', (id: string | number) => {
          const snapshot = terraDraw.getSnapshot();
          const feature = snapshot.find((f) => f.id === id);
          if (feature) {
            setDrawnGeometry(feature.geometry as GeoJSON.Geometry);
          }
        });

        drawRef.current = {
          terraDraw,
          cleanup: () => {
            try {
              terraDraw.stop();
            } catch {
              // terra-draw may throw if map is already removed
            }
          },
        };
      } catch (err) {
        console.error('Failed to initialize terra-draw:', err);
        setDrawMode(null);
      }
    },
    [mapRef, cleanupDraw],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupDraw();
  }, [cleanupDraw]);

  const handleSave = useCallback(() => {
    if (!drawnGeometry) return;
    if (!activeBaseId) {
      // Make the failure visible — previously this silently no-op'd
      // and the drawn shape just vanished, which read as "Save button
      // doesn't work."
      setMessage('Error: No home base set for this user. Assign a base in admin, then try again.');
      setTimeout(() => setMessage(null), 6000);
      return;
    }
    setSaving(true);

    const kind = drawMode === 'circle' ? ('circle' as const) : ('polygon' as const);

    let geometry: unknown = drawnGeometry;
    let radiusNm: number | undefined;

    if (kind === 'circle' && drawnGeometry.type === 'Polygon') {
      // For circle drawn by terra-draw, approximate the center and radius
      // from the polygon vertices
      const coords = (drawnGeometry as GeoJSON.Polygon).coordinates[0];
      if (coords && coords.length > 0) {
        // Calculate centroid
        let sumLon = 0;
        let sumLat = 0;
        const len = coords.length - 1; // last point duplicates first
        for (let i = 0; i < len; i++) {
          const coord = coords[i];
          if (coord) {
            sumLon += coord[0] ?? 0;
            sumLat += coord[1] ?? 0;
          }
        }
        const centerLon = sumLon / len;
        const centerLat = sumLat / len;

        // Calculate radius from center to first vertex (in nm)
        const firstCoord = coords[0];
        if (firstCoord) {
          const dLat = ((firstCoord[1] ?? 0) - centerLat) * 60; // nm
          const dLon =
            ((firstCoord[0] ?? 0) - centerLon) * 60 * Math.cos((centerLat * Math.PI) / 180);
          radiusNm = Math.sqrt(dLat * dLat + dLon * dLon);
        }

        geometry = {
          type: 'Point',
          coordinates: [centerLon, centerLat],
        };
      }
    }

    upsertMutation.mutate({
      baseId: activeBaseId,
      kind,
      geometry,
      radiusNm,
      label: 'Training Area',
    });
  }, [drawnGeometry, drawMode, activeBaseId, upsertMutation]);

  const handleCancel = useCallback(() => {
    setDrawnGeometry(null);
    setDrawMode(null);
    cleanupDraw();
  }, [cleanupDraw]);

  const handleDelete = useCallback(() => {
    if (!geofence?.id) return;
    deleteMutation.mutate({ id: geofence.id });
  }, [geofence?.id, deleteMutation]);

  // Check if user has admin access by checking if the geofence mutation is available.
  // The upsert mutation will fail for non-admins, so we conditionally render.
  // We detect admin by checking if getActive succeeded (non-admin gets error).
  const geofenceQuery = trpc.admin.geofence.getActive.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  // If getActive failed (non-admin), don't show the editor
  if (geofenceQuery.isError) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 12,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Drawing controls */}
      {!drawMode && !drawnGeometry && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => void startDraw('polygon')}
            style={toolButtonStyle}
            title="Draw polygon geofence"
          >
            Draw Polygon
          </button>
          <button
            onClick={() => void startDraw('circle')}
            style={toolButtonStyle}
            title="Draw circle geofence"
          >
            Draw Circle
          </button>
          {geofence && (
            <button
              onClick={handleDelete}
              style={{ ...toolButtonStyle, borderColor: '#ef4444', color: '#ef4444' }}
              title="Delete current geofence"
            >
              Delete Geofence
            </button>
          )}
        </div>
      )}

      {/* Active drawing mode indicator */}
      {drawMode && !drawnGeometry && (
        <div
          style={{
            background: '#1a1a2e',
            color: '#fbbf24',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Drawing {drawMode}... Click on the map to add points
          {drawMode === 'polygon' ? ', double-click to finish' : ''}
          <button
            onClick={handleCancel}
            style={{
              marginLeft: 12,
              color: '#ef4444',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Save / Cancel after drawing */}
      {drawnGeometry && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...toolButtonStyle, borderColor: '#22c55e', color: '#22c55e' }}
          >
            {saving ? 'Saving...' : 'Save Geofence'}
          </button>
          <button onClick={handleCancel} style={toolButtonStyle}>
            Cancel
          </button>
        </div>
      )}

      {/* Status message */}
      {message && (
        <div
          style={{
            background: message.startsWith('Error') ? '#7f1d1d' : '#1a1a2e',
            color: message.startsWith('Error') ? '#fca5a5' : '#86efac',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}

const toolButtonStyle: React.CSSProperties = {
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
