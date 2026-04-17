/**
 * EmptyState — for lists / panels with no data.
 */
import type { ReactNode } from 'react';
import { color, radius } from './tokens';

interface Props {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, hint, action, compact }: Props) {
  return (
    <div
      style={{
        padding: compact ? '0.75rem 0.9rem' : '1.5rem 1rem',
        background: color.surface,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        textAlign: 'center',
        color: color.fgDim,
        fontSize: '0.85rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <div style={{ color: color.fgMuted, fontSize: '0.9rem' }}>{title}</div>
      {hint ? <div style={{ fontSize: '0.78rem', color: color.fgFaint }}>{hint}</div> : null}
      {action ? <div style={{ marginTop: '0.35rem' }}>{action}</div> : null}
    </div>
  );
}
