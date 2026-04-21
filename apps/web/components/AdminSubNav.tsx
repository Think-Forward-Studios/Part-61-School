/**
 * AdminSubNav — the unified sub-header that renders for every admin-role
 * page (admin + global utility routes). Pulled out of admin/layout.tsx
 * so it can also render on /record, /flight-log, /fleet-map, /profile/*,
 * and /schedule when the active role is admin.
 */
import Link from 'next/link';

const ADMIN_LINKS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/people', label: 'People' },
  { href: '/admin/people/pending', label: 'Pending' },
  { href: '/admin/aircraft', label: 'Aircraft' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/rooms', label: 'Rooms' },
  { href: '/admin/blocks', label: 'Blocks' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/rates', label: 'Rates' },
  { href: '/admin/audit/logs', label: 'Audit' },
  { href: '/admin/overrides', label: 'Overrides' },
  { href: '/admin/school', label: 'Settings' },
];

const GLOBAL_LINKS = [
  { href: '/record', label: 'Record' },
  { href: '/flight-log', label: 'Flight Log' },
  { href: '/fleet-map', label: 'Fleet Map' },
  { href: '/profile/notifications', label: 'Prefs' },
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

export function AdminSubNav() {
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
        <Link
          key={l.href}
          href={l.href}
          style={{
            ...linkStyle,
            color: l.label === 'Prefs' ? '#7a869a' : '#cbd5e1',
          }}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
