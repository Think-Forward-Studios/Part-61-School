/**
 * PageHeader — consistent top-of-page title block.
 *   eyebrow:   small uppercase mono label above the title
 *   title:     H1
 *   subtitle:  descriptive line beneath
 *   actions:   right-aligned controls
 */
import type { ReactNode } from 'react';
import { color } from './tokens';

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  display?: boolean; // use display font (Antonio) — defaults to true
}

export function PageHeader({ eyebrow, title, subtitle, actions, display = true }: Props) {
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: '1rem',
        padding: '1.5rem 0 1.25rem',
        borderBottom: `1px solid ${color.borderSubtle}`,
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow ? (
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.68rem',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: color.fgFaint,
              marginBottom: '0.35rem',
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1
          style={{
            margin: 0,
            fontFamily: display ? '"Antonio", system-ui, sans-serif' : undefined,
            fontSize: display ? 'clamp(1.6rem, 2.5vw, 2rem)' : '1.35rem',
            lineHeight: 1.05,
            fontWeight: display ? 600 : 600,
            letterSpacing: display ? '-0.01em' : undefined,
            color: color.fg,
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              margin: '0.35rem 0 0',
              color: color.fgDim,
              fontSize: '0.9rem',
              maxWidth: 600,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>{actions}</div>
      ) : null}
    </header>
  );
}
