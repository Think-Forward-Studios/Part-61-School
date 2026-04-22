import type { ReactNode } from 'react';

/**
 * Fleet-map route layout.
 *
 * Two things this layout owns:
 *
 * 1. Viewport lock. Tracker's LiveMapView depends on html + body being
 *    height: 100% with overflow hidden so DeckGL's continuous repaint
 *    doesn't trigger body-scroll drift. Scoped to this route only.
 *
 * 2. Height chain. Parent (app)/layout.tsx uses minHeight: 100vh on
 *    .tfs-app (not height), so a naive `height: 100%` on our wrapper
 *    resolves against `auto` and collapses to 0 — which is why the map
 *    rendered blank below the sub-nav. We bypass the broken flex chain
 *    by pinning the content with position: fixed, offset down by the
 *    top header (~61px) + role sub-nav (~48px). That leaves the nav
 *    sticky elements visible and fills the remaining viewport with the
 *    map.
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
      <div
        style={{
          position: 'fixed',
          top: 109, // ~61px top header + ~48px role sub-nav
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </>
  );
}
