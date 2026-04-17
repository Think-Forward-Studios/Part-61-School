/**
 * DashboardTile — aviation-styled tile (redesigned 2026-04).
 *
 * Used by Student/Instructor/Mechanic dashboards. Wraps children in a
 * surface card with an accent-coded top border.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

type Accent = 'default' | 'info' | 'warn' | 'critical' | 'success';

const ACCENTS: Record<Accent, { top: string; glow: string }> = {
  default: { top: '#293352', glow: 'rgba(41, 51, 82, 0)' },
  info: { top: '#38bdf8', glow: 'rgba(56, 189, 248, 0.12)' },
  success: { top: '#34d399', glow: 'rgba(52, 211, 153, 0.12)' },
  warn: { top: '#fbbf24', glow: 'rgba(251, 191, 36, 0.15)' },
  critical: { top: '#f87171', glow: 'rgba(248, 113, 113, 0.15)' },
};

interface Props {
  title: string;
  href?: string;
  action?: ReactNode;
  accent?: Accent;
  children: ReactNode;
}

export function DashboardTile({ title, href, action, accent = 'default', children }: Props) {
  const { top, glow } = ACCENTS[accent];
  const body = (
    <section
      style={{
        position: 'relative',
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderTop: `3px solid ${top}`,
        borderRadius: 12,
        padding: '1rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        minHeight: 160,
        transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
        boxShadow: `0 1px 0 rgba(255,255,255,0.02) inset, 0 0 30px -15px ${glow}`,
        color: '#f7f9fc',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.5rem',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.68rem',
            letterSpacing: '0.25em',
            color: '#7a869a',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          {title}
        </h2>
        {action ? <span style={{ flexShrink: 0 }}>{action}</span> : null}
      </header>
      <div style={{ fontSize: '0.88rem', color: '#cbd5e1', flex: 1 }}>{children}</div>
      {href ? (
        <div
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.65rem',
            letterSpacing: '0.2em',
            color: top === '#293352' ? '#7a869a' : top,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            marginTop: 'auto',
          }}
        >
          Open <span>→</span>
        </div>
      ) : null}
    </section>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {body}
      </Link>
    );
  }
  return body;
}
