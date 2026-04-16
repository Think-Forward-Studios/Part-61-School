/**
 * DashboardTile — Phase 8 reusable card shell.
 *
 * Role-dashboard tiles (student/instructor/mechanic) wrap their content
 * in this component for consistent padding, border, and optional accent.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

type Accent = 'default' | 'info' | 'warn' | 'critical';

const ACCENTS: Record<Accent, { border: string; bg: string }> = {
  default: { border: '#e5e7eb', bg: 'white' },
  info: { border: '#bfdbfe', bg: '#eff6ff' },
  warn: { border: '#fde68a', bg: '#fffbeb' },
  critical: { border: '#fecaca', bg: '#fef2f2' },
};

interface Props {
  title: string;
  href?: string;
  action?: ReactNode;
  accent?: Accent;
  children: ReactNode;
}

export function DashboardTile({ title, href, action, accent = 'default', children }: Props) {
  const { border, bg } = ACCENTS[accent];
  const body = (
    <section
      style={{
        padding: '0.85rem',
        border: `1px solid ${border}`,
        borderRadius: 8,
        background: bg,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        minHeight: 140,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '0.95rem' }}>{title}</h2>
        {action ? <span>{action}</span> : null}
      </header>
      <div style={{ fontSize: '0.85rem', color: '#1f2937' }}>{children}</div>
    </section>
  );
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {body}
      </Link>
    );
  }
  return body;
}
