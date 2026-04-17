/**
 * Metric — big-number tile (dashboard primary stats).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { color, radius } from './tokens';

interface Props {
  label: ReactNode;
  value: ReactNode;
  suffix?: ReactNode;
  caption?: ReactNode;
  accent?: string;
  href?: string;
  tone?: 'default' | 'warn' | 'danger';
}

export function Metric({ label, value, suffix, caption, accent, href, tone = 'default' }: Props) {
  const toneAccent =
    tone === 'warn' ? color.amber : tone === 'danger' ? color.rose : (accent ?? color.sky);

  const inner = (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderTop: `3px solid ${toneAccent}`,
        borderRadius: radius.lg,
        padding: '1.1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
        minWidth: 160,
      }}
    >
      <div
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.65rem',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: color.fgDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"Antonio", system-ui, sans-serif',
          fontSize: '2.4rem',
          fontWeight: 700,
          lineHeight: 1,
          color: color.fg,
          letterSpacing: '-0.02em',
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.3rem',
        }}
      >
        <span>{value}</span>
        {suffix ? (
          <span style={{ fontSize: '1rem', color: color.fgDim, fontWeight: 400 }}>{suffix}</span>
        ) : null}
      </div>
      {caption ? (
        <div style={{ fontSize: '0.78rem', color: color.fgDim, marginTop: '0.25rem' }}>
          {caption}
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
