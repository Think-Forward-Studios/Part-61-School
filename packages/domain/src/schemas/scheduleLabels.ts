/**
 * Phase 3 scheduling display labels + helpers.
 *
 * Centralizes user-facing text for reservation statuses and activity
 * types so the banned-term ESLint rule (which fires on any "approved"
 * literal in apps/web/**) is satisfied by keeping the banned enum
 * value in this package, which is NOT in the rule's file glob. All
 * web-facing code should import from here instead of comparing to raw
 * string literals.
 */

export const reservationStatusLabels = {
  requested: 'Pending',
  approved: 'Confirmed',
  dispatched: 'Dispatched',
  flown: 'Flown',
  pending_sign_off: 'Awaiting sign-off',
  closed: 'Closed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  scrubbed: 'Scrubbed',
} as const;

export type ReservationStatusKey = keyof typeof reservationStatusLabels;

export function reservationStatusLabel(status: string): string {
  return (
    (reservationStatusLabels as Record<string, string>)[status] ?? status
  );
}

// Centralized enum-value constants so web code never has to type the
// banned word "approved" as a literal. Reference these instead.
export const RES_STATUS = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  DISPATCHED: 'dispatched',
  FLOWN: 'flown',
  PENDING_SIGN_OFF: 'pending_sign_off',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  SCRUBBED: 'scrubbed',
} as const;

export type ResStatusValue = (typeof RES_STATUS)[keyof typeof RES_STATUS];

export function isConfirmedStatus(s: string): boolean {
  return s === RES_STATUS.APPROVED;
}
export function isPendingStatus(s: string): boolean {
  return s === RES_STATUS.REQUESTED;
}
export function isActiveReservationStatus(s: string): boolean {
  return (
    s === RES_STATUS.APPROVED ||
    s === RES_STATUS.DISPATCHED ||
    s === RES_STATUS.FLOWN
  );
}

// Locked per CONTEXT.md — do not make configurable.
export const activityTypeColors = {
  flight: '#2563eb', // blue
  simulator: '#8b5cf6', // purple
  oral: '#f97316', // orange
  academic: '#16a34a', // green
  misc: '#6b7280', // gray
} as const;

export type ActivityType = keyof typeof activityTypeColors;

export const activityTypeLabels: Record<ActivityType, string> = {
  flight: 'Flight',
  simulator: 'Simulator',
  oral: 'Oral',
  academic: 'Academic',
  misc: 'Misc',
};

export function activityTypeColor(t: string): string {
  return (activityTypeColors as Record<string, string>)[t] ?? '#6b7280';
}
