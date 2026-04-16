import type { ReactNode } from 'react';
import Link from 'next/link';

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
  <div>
    <style>{`
      html, body {
        height: 100%;
        overflow: hidden;
      }
    `}</style>
    <nav
    style={{
      display: 'flex',
      gap: '1rem',
      padding: '0.75rem 1rem',
      borderBottom: '1px solid #eee',
      background: '#fafafa',
    }}
    >
      <Link href="/admin/dashboard">Dashboard</Link>
      <Link href="/admin/people">People</Link>
      <Link href="/admin/people/pending">Pending</Link>
      <Link href="/admin/aircraft">Aircraft</Link>
      <Link href="/admin/schedule">Schedule</Link>
      <Link href="/admin/rooms">Rooms</Link>
      <Link href="/admin/blocks">Blocks</Link>
      <Link href="/admin/audit/training-records">Audit</Link>
      <Link href="/admin/overrides">Overrides</Link>
      <Link href="/admin/school">School Settings</Link>
    </nav>
    {children}
  </div>
);
}