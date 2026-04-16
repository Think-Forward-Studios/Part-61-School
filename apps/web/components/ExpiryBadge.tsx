/**
 * ExpiryBadge — Phase 8 (STU-01, IPF-01).
 *
 * Color-coded day-count badge per CONTEXT-locked thresholds:
 *   - green  (>30d)
 *   - yellow (8–30d)
 *   - red    (<=7d or EXPIRED)
 *
 * Styling uses inline styles (no Tailwind dependency) so the badge can
 * render in any server or client component without additional setup.
 */
interface Props {
  expiresAt: Date | string | null | undefined;
  now?: Date;
}

export type ExpiryBand = 'expired' | 'critical' | 'warning' | 'ok' | 'none';

export function classifyExpiry(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): { band: ExpiryBand; daysLeft: number | null; label: string } {
  if (!expiresAt) {
    return { band: 'none', daysLeft: null, label: 'no expiry' };
  }
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (isNaN(exp.getTime())) {
    return { band: 'none', daysLeft: null, label: 'no expiry' };
  }
  const daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return { band: 'expired', daysLeft, label: 'EXPIRED' };
  if (daysLeft <= 7) return { band: 'critical', daysLeft, label: `${daysLeft}d` };
  if (daysLeft <= 30) return { band: 'warning', daysLeft, label: `${daysLeft}d` };
  return { band: 'ok', daysLeft, label: `${daysLeft}d` };
}

export function bandColors(band: ExpiryBand): { bg: string; fg: string } {
  switch (band) {
    case 'expired':
    case 'critical':
      return { bg: '#fee2e2', fg: '#991b1b' };
    case 'warning':
      return { bg: '#fef3c7', fg: '#92400e' };
    case 'ok':
      return { bg: '#dcfce7', fg: '#166534' };
    case 'none':
    default:
      return { bg: '#f3f4f6', fg: '#6b7280' };
  }
}

export function ExpiryBadge({ expiresAt, now }: Props) {
  const { band, label } = classifyExpiry(expiresAt, now);
  const { bg, fg } = bandColors(band);
  return (
    <span
      data-expiry-band={band}
      style={{
        background: bg,
        color: fg,
        padding: '0.15rem 0.5rem',
        borderRadius: 4,
        fontSize: '0.75rem',
        fontWeight: 600,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
}
