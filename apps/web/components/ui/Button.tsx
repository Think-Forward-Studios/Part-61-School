'use client';
/**
 * Button — three variants.
 *   primary:   amber gradient, uppercase, emphatic
 *   secondary: surface with border, balanced
 *   ghost:     transparent with hover tint
 *
 * Sizes: sm / md (default) / lg
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { color, radius } from './tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  full?: boolean;
}

const sizeStyles: Record<Size, React.CSSProperties> = {
  sm: { padding: '0.35rem 0.7rem', fontSize: '0.75rem', borderRadius: radius.base },
  md: { padding: '0.55rem 0.95rem', fontSize: '0.85rem', borderRadius: radius.md },
  lg: { padding: '0.8rem 1.1rem', fontSize: '0.95rem', borderRadius: radius.md },
};

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: `linear-gradient(180deg, ${color.amber} 0%, ${color.amber600} 100%)`,
    color: color.bg,
    border: 'none',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    boxShadow: '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
  },
  secondary: {
    background: color.surfaceElev,
    color: color.fg,
    border: `1px solid ${color.border}`,
    fontWeight: 500,
  },
  ghost: {
    background: 'transparent',
    color: color.fgMuted,
    border: '1px solid transparent',
    fontWeight: 500,
  },
  danger: {
    background: color.rose600,
    color: color.fg,
    border: 'none',
    fontWeight: 600,
  },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  full,
  children,
  disabled,
  style,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.4rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.08s ease, box-shadow 0.15s ease, background 0.15s ease',
        width: full ? '100%' : undefined,
        whiteSpace: 'nowrap',
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
      onMouseDown={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)';
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = '';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = '';
      }}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
