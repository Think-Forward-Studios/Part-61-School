/**
 * Shared dark-theme styles for the person detail panels
 * (HoldsPanel, CurrenciesPanel, QualificationsPanel,
 *  EmergencyContactsPanel, InfoReleasePanel, ExperiencePanel).
 *
 * Keeps every panel's cards, headings, inputs, buttons, and list rows
 * reading the same in one place — avoids re-editing 6 files every
 * time the palette shifts.
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

/** Amber primary button — used for "Add", "Authorize", etc. */
export const primaryButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.85rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
};

/** Neutral secondary button — used as a quiet companion to the primary. */
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

/** Destructive button — used for "Revoke", "Delete", "Remove", "Clear". */
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

/** Row wrapper used by list-style panels (qualifications, contacts, …). */
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

/** Status chips for "current" / "expired" etc. */
export const chipCurrent: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.1rem 0.45rem',
  background: 'rgba(52, 211, 153, 0.14)',
  border: '1px solid rgba(52, 211, 153, 0.4)',
  borderRadius: 999,
  color: '#6ee7b7',
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
};

export const chipExpired: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.1rem 0.45rem',
  background: 'rgba(248, 113, 113, 0.14)',
  border: '1px solid rgba(248, 113, 113, 0.4)',
  borderRadius: 999,
  color: '#fca5a5',
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
};
