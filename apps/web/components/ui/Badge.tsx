/**
 * Badge — small status chip. Can be role-coded, status-coded, or custom.
 */
import type { ReactNode } from 'react';
import { color, roleColor } from './tokens';

type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'amber';
type Role = keyof typeof roleColor;

interface Props {
  children: ReactNode;
  tone?: Tone;
  role?: Role;
  custom?: string; // override hex
  size?: 'sm' | 'md';
  mono?: boolean;
}

const tones: Record<Tone, string> = {
  neutral: color.fgDim,
  info: color.sky,
  success: color.mint,
  warn: color.amber,
  danger: color.rose,
  amber: color.amber,
};

export function Badge({ children, tone = 'neutral', role, custom, size = 'md', mono }: Props) {
  const hue = custom ?? (role ? roleColor[role] : tones[tone]);
  const fontSize = size === 'sm' ? '0.6rem' : '0.7rem';
  const padding = size === 'sm' ? '0.1rem 0.4rem' : '0.18rem 0.5rem';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding,
        background: `${hue}22`,
        color: hue,
        border: `1px solid ${hue}44`,
        borderRadius: 999,
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: mono ? '"JetBrains Mono", ui-monospace, monospace' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
