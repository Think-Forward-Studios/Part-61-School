'use client';

import dynamic from 'next/dynamic';

const FleetMapClient = dynamic(() => import('./FleetMapClient'), {
  ssr: false,
  loading: () => (
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
      Loading map...
    </div>
  ),
});

export default function FleetMapPage() {
  return <FleetMapClient />;
}
