'use client';
/**
 * RoleSubNav — sub-header navigation rendered for every authenticated
 * role. Same themed-dropdown structure across admin / instructor /
 * student / mechanic / rental_customer, with each role getting a
 * trimmed set of groups + links appropriate to what their RLS /
 * route guards actually allow.
 *
 * Replaces the old split between a flat top-header nav for non-admins
 * and a separate AdminSubNav for admins.
 */
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type NavLink = { href: string; label: string };
type Group = { label: string; accent: string; links: NavLink[] };
type NavConfig = {
  badge: { label: string; color: string };
  directLinks: NavLink[];
  groups: Group[];
};
type Role = 'admin' | 'instructor' | 'student' | 'mechanic' | 'rental_customer';

// ---------------------------------------------------------------------
// Role-specific configs. Order of directLinks + groups is left-to-right.
// Colors mirror tokens.ts role palette:
//   admin     = orange   #f97316   OPS
//   instructor= sky      #38bdf8   CFI
//   student   = mint     #34d399   STU
//   mechanic  = violet   #a78bfa   MX
//   rental    = dim      #7a869a   REN
// ---------------------------------------------------------------------

const ACCENT = {
  orange: '#f97316',
  sky: '#38bdf8',
  mint: '#34d399',
  violet: '#a78bfa',
  amber: '#fbbf24',
  dim: '#7a869a',
};

const CONFIGS: Record<Role, NavConfig> = {
  admin: {
    badge: { label: 'OPS · Admin', color: ACCENT.orange },
    directLinks: [{ href: '/admin/dashboard', label: 'Dashboard' }],
    groups: [
      {
        label: 'Directory',
        accent: ACCENT.orange,
        links: [
          { href: '/admin/people', label: 'All People' },
          { href: '/admin/people/pending', label: 'Pending Registrations' },
          { href: '/admin/people/new', label: '+ New Person' },
        ],
      },
      {
        label: 'Scheduling',
        accent: ACCENT.sky,
        links: [
          { href: '/admin/schedule', label: 'Schedule Admin' },
          { href: '/schedule', label: 'Calendar View' },
          { href: '/dispatch', label: 'Dispatch Board' },
          { href: '/schedule/approvals', label: 'Pending Approvals' },
          { href: '/schedule/request', label: '+ Request Reservation' },
          { href: '/admin/blocks', label: 'Blocks' },
          { href: '/admin/blocks/new', label: '+ New Block' },
          { href: '/admin/rooms', label: 'Rooms' },
        ],
      },
      {
        label: 'Training',
        accent: ACCENT.mint,
        links: [
          { href: '/admin/courses', label: 'Course Catalog' },
          { href: '/admin/enrollments', label: 'Enrollments' },
          { href: '/admin/stage-checks', label: 'Stage Checks' },
          { href: '/admin/endorsements', label: 'Endorsements' },
          { href: '/admin/fif', label: 'Flight Instruction Forms' },
          { href: '/admin/fif/new', label: '+ New FIF' },
          { href: '/admin/rates', label: 'Rates' },
          { href: '/record', label: 'School Directory (Record)' },
        ],
      },
      {
        label: 'Fleet & Maintenance',
        accent: ACCENT.violet,
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
          // Personal flight log — shows only the admin's own flight time
          // (RLS-scoped to caller). Kept here for admins who are also
          // rated pilots; for school-wide flight data use /admin/reports.
          { href: '/flight-log', label: 'My Flight Log' },
        ],
      },
      {
        label: 'Audit & Oversight',
        accent: ACCENT.amber,
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
        accent: ACCENT.sky,
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
        label: 'Account & School',
        accent: ACCENT.dim,
        links: [
          { href: '/admin/school', label: 'School Settings' },
          { href: '/profile', label: 'My Profile' },
          { href: '/profile/notifications', label: 'Notification Prefs' },
          { href: '/profile/documents', label: 'My Documents' },
        ],
      },
    ],
  },

  instructor: {
    badge: { label: 'CFI · Instructor', color: ACCENT.sky },
    directLinks: [{ href: '/dashboard', label: 'Dashboard' }],
    groups: [
      {
        label: 'Scheduling',
        accent: ACCENT.sky,
        links: [
          { href: '/schedule', label: 'Calendar View' },
          { href: '/dispatch', label: 'Dispatch Board' },
          { href: '/schedule/approvals', label: 'Pending Approvals' },
          { href: '/schedule/request', label: '+ Request Reservation' },
        ],
      },
      {
        label: 'Training',
        accent: ACCENT.mint,
        links: [
          { href: '/record', label: 'My Record' },
          { href: '/flight-log', label: 'Flight Log' },
        ],
      },
      {
        label: 'Fleet & Maintenance',
        accent: ACCENT.violet,
        links: [{ href: '/fleet-map', label: 'Live Fleet Map' }],
      },
      {
        label: 'Account & School',
        accent: ACCENT.dim,
        links: [
          { href: '/profile', label: 'My Profile' },
          { href: '/profile/notifications', label: 'Notification Prefs' },
          { href: '/profile/documents', label: 'My Documents' },
        ],
      },
    ],
  },

  student: {
    badge: { label: 'STU · Student', color: ACCENT.mint },
    directLinks: [{ href: '/dashboard', label: 'Dashboard' }],
    groups: [
      {
        label: 'Scheduling',
        accent: ACCENT.sky,
        links: [
          { href: '/schedule', label: 'Calendar View' },
          { href: '/schedule/request', label: '+ Request Reservation' },
        ],
      },
      {
        label: 'Training',
        accent: ACCENT.mint,
        links: [
          { href: '/record', label: 'My Record' },
          { href: '/flight-log', label: 'Flight Log' },
        ],
      },
      {
        label: 'Fleet & Maintenance',
        accent: ACCENT.violet,
        links: [{ href: '/fleet-map', label: 'Live Fleet Map' }],
      },
      {
        label: 'Account & School',
        accent: ACCENT.dim,
        links: [
          { href: '/profile', label: 'My Profile' },
          { href: '/profile/notifications', label: 'Notification Prefs' },
          { href: '/profile/documents', label: 'My Documents' },
        ],
      },
    ],
  },

  mechanic: {
    badge: { label: 'MX · Mechanic', color: ACCENT.violet },
    directLinks: [{ href: '/dashboard', label: 'Dashboard' }],
    groups: [
      {
        label: 'Fleet & Maintenance',
        accent: ACCENT.violet,
        links: [
          { href: '/fleet-map', label: 'Live Fleet Map' },
          { href: '/flight-log', label: 'Flight Log' },
        ],
      },
      {
        label: 'Account & School',
        accent: ACCENT.dim,
        links: [
          { href: '/profile', label: 'My Profile' },
          { href: '/profile/notifications', label: 'Notification Prefs' },
          { href: '/profile/documents', label: 'My Documents' },
        ],
      },
    ],
  },

  rental_customer: {
    badge: { label: 'REN · Rental', color: ACCENT.dim },
    directLinks: [{ href: '/dashboard', label: 'Dashboard' }],
    groups: [
      {
        label: 'Scheduling',
        accent: ACCENT.sky,
        links: [
          { href: '/schedule', label: 'Calendar View' },
          { href: '/schedule/request', label: '+ Request Reservation' },
        ],
      },
      {
        label: 'Training',
        accent: ACCENT.mint,
        links: [
          { href: '/record', label: 'My Record' },
          { href: '/flight-log', label: 'Flight Log' },
        ],
      },
      {
        label: 'Fleet & Maintenance',
        accent: ACCENT.violet,
        links: [{ href: '/fleet-map', label: 'Live Fleet Map' }],
      },
      {
        label: 'Account & School',
        accent: ACCENT.dim,
        links: [
          { href: '/profile', label: 'My Profile' },
          { href: '/profile/notifications', label: 'Notification Prefs' },
          { href: '/profile/documents', label: 'My Documents' },
        ],
      },
    ],
  },
};

const linkStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#cbd5e1',
  textDecoration: 'none',
  padding: '0.35rem 0.7rem',
  borderRadius: 5,
  whiteSpace: 'nowrap',
  transition: 'background 0.15s ease, color 0.15s ease',
};

// ---------------------------------------------------------------------
// GroupDropdown — one section's button + portaled menu.
// Takes openKey / onOpenChange so only one can be open at a time.
// ---------------------------------------------------------------------
function GroupDropdown({
  group,
  openKey,
  onOpenChange,
}: {
  group: Group;
  openKey: string | null;
  onOpenChange: (key: string | null) => void;
}) {
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = openKey === group.label;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      if (buttonRef.current) {
        setButtonRect(buttonRef.current.getBoundingClientRect());
      }
    }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onOpenChange(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(null);
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open, onOpenChange]);

  function menuStyle(): React.CSSProperties {
    if (!buttonRect) return { display: 'none' };
    const menuWidth = 260;
    let left = buttonRect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    return {
      position: 'fixed',
      top: buttonRect.bottom + 6,
      left,
      width: menuWidth,
      maxHeight: `calc(100vh - ${buttonRect.bottom + 24}px)`,
      overflowY: 'auto',
      background: '#0d1220',
      border: '1px solid #1f2940',
      borderRadius: 10,
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.55)',
      padding: '0.5rem',
      zIndex: 9999,
    };
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onOpenChange(open ? null : group.label)}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          ...linkStyle,
          background: open ? `${group.accent}1a` : 'transparent',
          color: open ? group.accent : '#cbd5e1',
          border: '1px solid',
          borderColor: open ? `${group.accent}55` : 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.2rem',
        }}
      >
        {group.label}
        <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>▾</span>
      </button>
      {mounted && open
        ? createPortal(
            <div ref={menuRef} role="menu" style={menuStyle()}>
              <div
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.6rem',
                  letterSpacing: '0.2em',
                  color: group.accent,
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  padding: '0.35rem 0.5rem 0.5rem',
                  borderBottom: `1px solid ${group.accent}22`,
                  marginBottom: '0.25rem',
                }}
              >
                ◆ {group.label}
              </div>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.1rem',
                }}
              >
                {group.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => onOpenChange(null)}
                      style={{
                        display: 'block',
                        padding: '0.35rem 0.55rem',
                        fontSize: '0.82rem',
                        color: '#cbd5e1',
                        textDecoration: 'none',
                        borderRadius: 4,
                        transition: 'background 0.1s, color 0.1s',
                      }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ---------------------------------------------------------------------
// RoleSubNav
// ---------------------------------------------------------------------
export function RoleSubNav({ role }: { role: Role }) {
  const config = CONFIGS[role];
  const [openKey, setOpenKey] = useState<string | null>(null);

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
          color: config.badge.color,
          textTransform: 'uppercase',
          marginRight: '0.75rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        ◆ {config.badge.label}
      </span>

      {config.directLinks.map((l) => (
        <Link key={l.href} href={l.href} style={linkStyle}>
          {l.label}
        </Link>
      ))}

      {config.groups.map((g) => (
        <GroupDropdown key={g.label} group={g} openKey={openKey} onOpenChange={setOpenKey} />
      ))}
    </nav>
  );
}
