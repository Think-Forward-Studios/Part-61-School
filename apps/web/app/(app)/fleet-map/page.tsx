'use client';

import dynamic from 'next/dynamic';
import { MapProvider } from 'react-map-gl/maplibre';
import { trpc } from '@/lib/trpc/client';
import { GeofenceAlert } from './_components/GeofenceAlert';
import { GeofenceEditor } from './_components/GeofenceEditor';
import type { FleetAircraft } from './_tracker/LiveMapView';

const LiveMapView = dynamic(() => import('./_tracker/LiveMapView'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Loading map...
    </div>
  ),
});

export default function FleetMapPage() {
  // Fetch school fleet tail numbers for highlighting.
  // Uses admin.aircraft.list -- fails silently for non-admins,
  // meaning fleet highlighting is admin-only. Traffic still shows.
  const fleetQuery = trpc.admin.aircraft.list.useQuery(
    { limit: 500, offset: 0 },
    {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  );

  const fleetAircraft: FleetAircraft[] = (fleetQuery.data ?? []).map((ac) => ({
    id: ac.id,
    tailNumber: ac.tailNumber,
  }));

  // Geofence query (admin only -- will fail silently for non-admins)
  const geofenceQuery = trpc.admin.geofence.getActive.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const activeGeofence = geofenceQuery.data ?? null;

  return (
    <MapProvider>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        <LiveMapView fleetAircraft={fleetAircraft} />
        {/* Geofence alert and editor rendered on top of the map */}
        <GeofenceAlert outsideAircraft={[]} />
        <GeofenceEditor geofence={activeGeofence} />
      </div>
    </MapProvider>
  );
}
