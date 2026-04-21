'use client';
/**
 * AdminSubNav — the unified sub-header that renders for every admin-role
 * page (admin + global utility routes). Pulled out of admin/layout.tsx
 * so it can also render on /record, /flight-log, /fleet-map, /profile/*,
 * and /schedule when the active role is admin.
 *
 * Contains a flat set of primary links plus a "More ▾" grouped dropdown
 * that covers every remaining page reachable in the admin surface, so
 * nothing gets stranded.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const ADMIN_LINKS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/people', label: 'People' },
  { href: '/admin/aircraft', label: 'Aircraft' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/dispatch', label: 'Dispatch' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/audit/logs', label: 'Audit' },
  { href: '/admin/school', label: 'Settings' },
];

// Grouped overflow — surfaces every remaining admin route in themed
// sections so "More ▾" is a true site map.
const MORE_GROUPS: Array<{
  label: string;
  accent: string;
  links: { href: string; label: string }[];
}> = [
  {
    label: 'Directory',
    accent: '#f97316',
    links: [
      { href: '/admin/people', label: 'All People' },
      { href: '/admin/people/pending', label: 'Pending Registrations' },
      { href: '/admin/people/new', label: '+ New Person' },
    ],
  },
  {
    label: 'Scheduling',
    accent: '#38bdf8',
    links: [
      { href: '/admin/schedule', label: 'Schedule Admin' },
      { href: '/schedule', label: 'Calendar View' },
      { href: '/schedule/approvals', label: 'Pending Approvals' },
      { href: '/schedule/request', label: '+ Request Reservation' },
      { href: '/admin/blocks', label: 'Blocks' },
      { href: '/admin/blocks/new', label: '+ New Block' },
      { href: '/admin/rooms', label: 'Rooms' },
    ],
  },
  {
    label: 'Training',
    accent: '#34d399',
    links: [
      { href: '/admin/courses', label: 'Course Catalog' },
      { href: '/admin/enrollments', label: 'Enrollments' },
      { href: '/admin/stage-checks', label: 'Stage Checks' },
      { href: '/admin/endorsements', label: 'Endorsements' },
      { href: '/admin/fif', label: 'Flight Instruction Forms' },
      { href: '/admin/fif/new', label: '+ New FIF' },
      { href: '/admin/rates', label: 'Rates' },
    ],
  },
  {
    label: 'Fleet & Maintenance',
    accent: '#a78bfa',
    links: [
      { href: '/admin/aircraft', label: 'Fleet' },
      { href: '/admin/aircraft/new', label: '+ New Aircraft' },
      { href: '/admin/maintenance', label: 'Maintenance Queue' },
      { href: '/admin/maintenance-templates', label: 'Maintenance Templates' },
      { href: '/admin/ads', label: 'Airworthiness Directives' },
      { href: '/admin/squawks', label: 'Squawks' },
      { href: '/admin/work-orders', label: 'Work Orders' },
      { href: '/admin/parts', label: 'Parts Inventory' },
      { href: '/fleet-map', label: 'Live Fleet Map' },
    ],
  },
  {
    label: 'Audit & Oversight',
    accent: '#fbbf24',
    links: [
      { href: '/admin/audit/logs', label: 'Audit Logs' },
      { href: '/admin/audit/activity-trail', label: 'Activity Trail' },
      { href: '/admin/audit/training-records', label: 'Training Record Audit' },
      { href: '/admin/active-sessions', label: 'Active Sessions' },
      { href: '/admin/overrides', label: 'Management Overrides' },
    ],
  },
  {
    label: 'Reports',
    accent: '#38bdf8',
    links: [
      { href: '/admin/reports', label: 'Reports Index' },
      { href: '/admin/reports/course-completion', label: 'Course Completion' },
      { href: '/admin/reports/fleet-utilization', label: 'Fleet Utilization' },
      { href: '/admin/reports/instructor-utilization', label: 'Instructor Utilization' },
      { href: '/admin/reports/no-show-rate', label: 'No-Show Rate' },
      { href: '/admin/reports/squawk-turnaround', label: 'Squawk Turnaround' },
      { href: '/admin/reports/student-progress', label: 'Student Progress' },
    ],
  },
  {
    label: 'Training Records',
    accent: '#34d399',
    links: [
      { href: '/record', label: 'School Directory' },
      { href: '/flight-log', label: 'Flight Log' },
    ],
  },
  {
    label: 'Account & School',
    accent: '#7a869a',
    links: [
      { href: '/admin/school', label: 'School Settings' },
      { href: '/profile', label: 'My Profile' },
      { href: '/profile/notifications', label: 'Notification Prefs' },
      { href: '/profile/documents', label: 'My Documents' },
    ],
  },
];

const linkStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#cbd5e1',
  textDecoration: 'none',
  padding: '0.35rem 0.7rem',
  borderRadius: 5,
  whiteSpace: 'nowrap',
  transition: 'background 0.15s ease, color 0.15s ease',
};

const globalLinkStyle: React.CSSProperties = {
  ...linkStyle,
  color: '#cbd5e1',
};

const GLOBAL_LINKS = [
  { href: '/record', label: 'Record' },
  { href: '/flight-log', label: 'Flight Log' },
  { href: '/fleet-map', label: 'Fleet Map' },
];

export function AdminSubNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [moreOpen]);

  return (
    <nav
      style={{
        display: 'flex',
        gap: '0.15rem',
        padding: '0.55rem 1.5rem',
        borderBottom: '1px solid #1a2238',
        background: 'rgba(10, 14, 26, 0.6)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        overflowX: 'auto',
        position: 'sticky',
        top: 61,
        zIndex: 19,
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.6rem',
          letterSpacing: '0.25em',
          color: '#f97316',
          textTransform: 'uppercase',
          marginRight: '0.75rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        ◆ Admin
      </span>
      {ADMIN_LINKS.map((l) => (
        <Link key={l.href} href={l.href} style={linkStyle}>
          {l.label}
        </Link>
      ))}

      {/* More ▾ dropdown — every remaining admin route grouped by theme */}
      <div ref={moreRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-haspopup="true"
          style={{
            ...linkStyle,
            background: moreOpen ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
            color: moreOpen ? '#fbbf24' : '#cbd5e1',
            border: '1px solid transparent',
            borderColor: moreOpen ? 'rgba(251, 191, 36, 0.3)' : 'transparent',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          More ▾
        </button>
        {moreOpen ? (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 0.4rem)',
              left: 0,
              minWidth: 820,
              maxWidth: '92vw',
              background: '#0d1220',
              border: '1px solid #1f2940',
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
              padding: '1rem 1.1rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.9rem 1.1rem',
              zIndex: 50,
            }}
          >
            {MORE_GROUPS.map((g) => (
              <div key={g.label}>
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '0.62rem',
                    letterSpacing: '0.18em',
                    color: g.accent,
                    textTransform: 'uppercase',
                    marginBottom: '0.5rem',
                    fontWeight: 600,
                    paddingBottom: '0.35rem',
                    borderBottom: `1px solid ${g.accent}22`,
                  }}
                >
                  {g.label}
                </div>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.15rem',
                  }}
                >
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setMoreOpen(false)}
                        style={{
                          display: 'block',
                          padding: '0.3rem 0.5rem',
                          fontSize: '0.82rem',
                          color: '#cbd5e1',
                          textDecoration: 'none',
                          borderRadius: 4,
                          transition: 'background 0.15s, color 0.15s',
                        }}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Divider between admin-section routes and cross-role utility routes */}
      <span
        aria-hidden
        style={{
          width: 1,
          alignSelf: 'stretch',
          background: '#1f2940',
          margin: '0.15rem 0.6rem',
        }}
      />

      {GLOBAL_LINKS.map((l) => (
        <Link key={l.href} href={l.href} style={globalLinkStyle}>
          {l.label}
        </Link>
      ))}
      <Link
        href="/profile/notifications"
        style={{
          ...globalLinkStyle,
          color: '#7a869a',
        }}
      >
        Prefs
      </Link>
    </nav>
  );
}
