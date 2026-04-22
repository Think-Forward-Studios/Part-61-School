import type { ReactNode } from 'react';

/**
 * Fleet-map route layout.
 *
 * Two things this layout owns:
 *
 * 1. Viewport lock. Tracker's LiveMapView depends on html + body being
 *    height: 100% with overflow hidden so DeckGL's continuous repaint
 *    doesn't trigger body-scroll drift. We scope the lock to this route
 *    only so the rest of the app still scrolls normally.
 *
 * 2. Height propagation. Parent (app)/layout.tsx renders the top header
 *    + role sub-nav as sticky elements, then a flex-1 children container.
 *    For the map to fill the remaining space, this layout's own wrapper
 *    has to declare height: 100% so that FleetMapPage's `height: 100%`
 *    resolves against a defined ancestor.
 *
 * NOTE: the old inline <nav> that used to live here was a pre-refactor
 * duplicate of the admin sub-nav. Removed — the role sub-nav in
 * (app)/layout.tsx now renders above this content on every page.
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
      <div style={{ height: '100%', overflow: 'hidden' }}>{children}</div>
    </>
  );
}
