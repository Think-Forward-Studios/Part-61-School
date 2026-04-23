/**
 * Shared dark-theme styles for the aircraft detail panels.
 * Mirrors the per-person-detail panel tokens but kept local so the
 * two surfaces can diverge later without coupling.
 */
import type { CSSProperties } from 'react';

export const section: CSSProperties = {
  marginTop: '1.25rem',
  padding: '1.1rem 1.25rem',
  background: 'rgba(18, 24, 38, 0.6)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
};

export const heading: CSSProperties = {
  margin: 0,
  fontSize: '0.72rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 600,
};

export const errorText: CSSProperties = {
  color: '#f87171',
  fontSize: '0.82rem',
  marginTop: '0.5rem',
  marginBottom: 0,
};

export const okText: CSSProperties = {
  color: '#4ade80',
  fontSize: '0.82rem',
  marginTop: '0.5rem',
  marginBottom: 0,
};

export const emptyText: CSSProperties = {
  color: '#7a869a',
  fontSize: '0.85rem',
  margin: '0.5rem 0 0',
};

export const input: CSSProperties = {
  height: '2.3rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '0 0.75rem',
  fontSize: '0.88rem',
  outline: 'none',
};

export const select: CSSProperties = {
  ...input,
  appearance: 'auto',
  cursor: 'pointer',
};

export const primaryButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
};

export const ghostButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 0.9rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const danger: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2rem',
  padding: '0 0.75rem',
  background: 'transparent',
  border: '1px solid rgba(248, 113, 113, 0.4)',
  borderRadius: 6,
  color: '#fca5a5',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

export const listRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '0.65rem 0',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  color: '#e2e8f0',
  fontSize: '0.88rem',
};

export const listRowMeta: CSSProperties = {
  color: '#7a869a',
  fontSize: '0.78rem',
  marginTop: '0.15rem',
};

export const fieldLabel: CSSProperties = {
  fontSize: '0.68rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 600,
};
