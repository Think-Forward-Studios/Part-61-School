'use client';

import { useEffect, useState } from 'react';

interface FeedStatusBannerProps {
  feedHealthy: boolean;
  isError: boolean;
}

export function FeedStatusBanner({ feedHealthy, isError }: FeedStatusBannerProps) {
  const [countdown, setCountdown] = useState(5);

  const showBanner = !feedHealthy || isError;

  useEffect(() => {
    if (!showBanner) return;

    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) return 5;
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showBanner]);

  if (!showBanner) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        background: '#92400e',
        color: '#fef3c7',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 16 }}>!</span>
      <span>ADS-B feed offline &mdash; positions may be stale. Retrying in {countdown}s...</span>
    </div>
  );
}
