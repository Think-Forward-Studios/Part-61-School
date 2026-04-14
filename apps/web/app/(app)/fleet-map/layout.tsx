import type { ReactNode } from 'react';

/**
 * Fleet map route layout.
 *
 * The Tracker's LiveMapView assumes html + body are locked to viewport height
 * with overflow hidden (same as the standalone ADS-B Tracker app's root
 * layout). Without this, Deck.gl's continuous repaint triggers body scroll
 * and the page drifts when untouched.
 *
 * We scope the lock to this route only so the rest of the school app (course
 * catalogs, people lists, etc.) still scrolls normally.
 */
export default function FleetMapLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          height: 100%;
          overflow: hidden;
        }
      `}</style>
      {children}
    </>
  );
}
