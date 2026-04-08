/**
 * Reservation status label. Imports display text from @part61/domain
 * so the banned-term lint rule never has to see the raw enum value in
 * web code. `approved` → "Confirmed" per CLAUDE.md banned-term caveat.
 */
import { reservationStatusLabel } from '@part61/domain';

export function StatusLabel({ status }: { status: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.45rem',
        borderRadius: 3,
        fontSize: '0.72rem',
        fontWeight: 600,
        background: '#f1f5f9',
        color: '#0f172a',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
      }}
    >
      {reservationStatusLabel(status)}
    </span>
  );
}
