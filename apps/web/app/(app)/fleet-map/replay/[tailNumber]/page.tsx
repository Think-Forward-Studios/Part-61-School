'use client';

import dynamic from 'next/dynamic';
import { use } from 'react';

const ReplayClient = dynamic(() => import('./ReplayClient'), {
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
      Loading track replay...
    </div>
  ),
});

type Params = Promise<{ tailNumber: string }>;

export default function ReplayPage({ params }: { params: Params }) {
  const { tailNumber } = use(params);
  const decoded = decodeURIComponent(tailNumber);
  return <ReplayClient tailNumber={decoded} />;
}
