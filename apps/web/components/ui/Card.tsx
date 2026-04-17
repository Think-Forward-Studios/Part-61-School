/**
 * Card — surface container with optional accent, header, footer.
 *
 * accent: colored left border (maps to role or status)
 * elev:   elevation level (0 = flat, 1 = default, 2 = raised)
 */
import type { ReactNode, HTMLAttributes } from 'react';
import Link from 'next/link';
import { color, radius, shadow } from './tokens';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  accent?: string; // any color (e.g. role color)
  elev?: 0 | 1 | 2;
  href?: string;
  hoverable?: boolean;
  children?: ReactNode;
  padded?: boolean;
}

export function Card({
  title,
  subtitle,
  action,
  footer,
  accent,
  elev = 1,
  href,
  hoverable,
  children,
  padded = true,
  style,
  ...rest
}: Props) {
  const bg =
    elev === 2
      ? `linear-gradient(180deg, ${color.surfaceElev} 0%, ${color.surface} 100%)`
      : elev === 0
        ? 'transparent'
        : color.surface;

  const boxShadow = elev === 2 ? shadow.lg : elev === 1 ? shadow.base : undefined;

  const inner = (
    <div
      {...rest}
      style={{
        background: bg,
        border: `1px solid ${color.border}`,
        borderLeftWidth: accent ? 3 : 1,
        borderLeftColor: accent ?? color.border,
        borderRadius: radius.lg,
        padding: padded ? '1rem 1.1rem' : 0,
        color: color.fg,
        boxShadow,
        display: 'flex',
        flexDirection: 'column',
        gap: title || subtitle ? '0.6rem' : '0.5rem',
        minHeight: 120,
        transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
        cursor: href || hoverable ? 'pointer' : undefined,
        textDecoration: 'none',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (href || hoverable) {
          e.currentTarget.style.borderColor = color.borderStrong;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (href || hoverable) {
          e.currentTarget.style.borderColor = color.border;
          e.currentTarget.style.transform = '';
        }
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            gap: '0.75rem',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title ? (
              <h3
                style={{
                  margin: 0,
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: color.fg,
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h3>
            ) : null}
            {subtitle ? (
              <p
                style={{
                  margin: '0.15rem 0 0',
                  fontSize: '0.78rem',
                  color: color.fgDim,
                }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
        </header>
      )}
      {children ? (
        <div style={{ flex: 1, fontSize: '0.88rem', color: color.fgMuted }}>{children}</div>
      ) : null}
      {footer ? (
        <footer
          style={{
            marginTop: '0.5rem',
            paddingTop: '0.7rem',
            borderTop: `1px solid ${color.borderSubtle}`,
            fontSize: '0.78rem',
            color: color.fgDim,
          }}
        >
          {footer}
        </footer>
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
