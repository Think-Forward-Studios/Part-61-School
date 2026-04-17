/**
 * Design tokens — the single source of truth for colors, spacing, type.
 * Mirrors CSS variables in globals.css for use in TS/TSX style objects.
 */

export const color = {
  bg: '#05070e',
  bgRaised: '#0a0e1a',
  surface: '#0d1220',
  surfaceElev: '#121826',
  surfaceElev2: '#182036',
  surfaceGlass: 'rgba(18, 24, 38, 0.72)',

  borderSubtle: '#1a2238',
  border: '#1f2940',
  borderStrong: '#293352',

  fg: '#f7f9fc',
  fgMuted: '#cbd5e1',
  fgDim: '#7a869a',
  fgFaint: '#5b6784',
  fgGhost: '#3b4660',

  amber: '#fbbf24',
  amber600: '#f59e0b',
  amber700: '#d97706',
  amberGlow: 'rgba(251, 191, 36, 0.35)',

  sky: '#38bdf8',
  sky600: '#0ea5e9',
  mint: '#34d399',
  mint600: '#10b981',
  rose: '#f87171',
  rose600: '#ef4444',
  violet: '#a78bfa',
  violet600: '#8b5cf6',
  orange: '#f97316',
  orange600: '#ea580c',
} as const;

export const roleColor = {
  admin: color.orange,
  instructor: color.sky,
  student: color.mint,
  mechanic: color.violet,
  rental_customer: color.fgDim,
} as const;

export const font = {
  display: '"Antonio", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
} as const;

export const radius = {
  sm: 4,
  base: 6,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  base: '0 4px 12px rgba(0, 0, 0, 0.35)',
  lg: '0 20px 60px rgba(0, 0, 0, 0.45)',
  glowAmber: '0 0 0 1px rgba(251, 191, 36, 0.12), 0 8px 30px rgba(251, 191, 36, 0.15)',
} as const;
