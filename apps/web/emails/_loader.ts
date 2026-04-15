/**
 * Template-key → React Email component registry.
 *
 * Used by the email worker route handler at
 * apps/web/app/api/emails/send/route.ts to hydrate an email_outbox
 * row into a concrete React element that @react-email/render can
 * stringify into HTML.
 *
 * Keys match `notification_event_kind` enum values where possible so
 * the mapping between outgoing event and template is obvious at call
 * sites.
 */
import { createElement, type ReactElement } from 'react';

import { AdminBroadcast } from './AdminBroadcast';
import { CurrencyExpiring } from './CurrencyExpiring';
import { DocumentExpiring } from './DocumentExpiring';
import { DutyHourWarning } from './DutyHourWarning';
import { GradingComplete } from './GradingComplete';
import { ReservationApproved } from './ReservationApproved';
import { ReservationCancelled } from './ReservationCancelled';
import { ReservationChanged } from './ReservationChanged';
import { ReservationReminder24h } from './ReservationReminder24h';
import { ReservationRequested } from './ReservationRequested';
import { SquawkGrounding } from './SquawkGrounding';
import { SquawkOpened } from './SquawkOpened';
import { SquawkReturnedToService } from './SquawkReturnedToService';

export type EmailTemplateKey =
  | 'reservation_requested'
  | 'reservation_approved'
  | 'reservation_changed'
  | 'reservation_cancelled'
  | 'reservation_reminder_24h'
  | 'grading_complete'
  | 'squawk_opened'
  | 'squawk_grounding'
  | 'squawk_returned_to_service'
  | 'document_expiring'
  | 'currency_expiring'
  | 'admin_broadcast'
  | 'duty_hour_warning';

export const EMAIL_TEMPLATE_KEYS: readonly EmailTemplateKey[] = [
  'reservation_requested',
  'reservation_approved',
  'reservation_changed',
  'reservation_cancelled',
  'reservation_reminder_24h',
  'grading_complete',
  'squawk_opened',
  'squawk_grounding',
  'squawk_returned_to_service',
  'document_expiring',
  'currency_expiring',
  'admin_broadcast',
  'duty_hour_warning',
] as const;

/**
 * Hydrate a template key + props-bag into a React element ready for
 * `render()` or `resend.emails.send({ react: ... })`.
 *
 * Props shape is validated at call-site (tRPC mutations pass a typed
 * literal). At the worker level, props come from a jsonb column and
 * are typed as `unknown` — we cast to the component's props via `any`
 * rather than introducing a full zod schema per template. Runtime
 * schema drift shows up as a React render error the worker can catch.
 */
// Runtime-typed registry. Props come from a jsonb column so static
// typechecking of each component's Props interface is not possible at
// this boundary — worker-level render failures surface as errors that
// the worker catches and writes to email_outbox.error_message.
export function loadEmailTemplate(key: string, props: unknown): ReactElement {
  const p = (props ?? {}) as Record<string, unknown>;
  switch (key as EmailTemplateKey) {
    case 'reservation_requested':
      return createElement(
        ReservationRequested,
        p as unknown as Parameters<typeof ReservationRequested>[0],
      );
    case 'reservation_approved':
      return createElement(
        ReservationApproved,
        p as unknown as Parameters<typeof ReservationApproved>[0],
      );
    case 'reservation_changed':
      return createElement(
        ReservationChanged,
        p as unknown as Parameters<typeof ReservationChanged>[0],
      );
    case 'reservation_cancelled':
      return createElement(
        ReservationCancelled,
        p as unknown as Parameters<typeof ReservationCancelled>[0],
      );
    case 'reservation_reminder_24h':
      return createElement(
        ReservationReminder24h,
        p as unknown as Parameters<typeof ReservationReminder24h>[0],
      );
    case 'grading_complete':
      return createElement(GradingComplete, p as unknown as Parameters<typeof GradingComplete>[0]);
    case 'squawk_opened':
      return createElement(SquawkOpened, p as unknown as Parameters<typeof SquawkOpened>[0]);
    case 'squawk_grounding':
      return createElement(SquawkGrounding, p as unknown as Parameters<typeof SquawkGrounding>[0]);
    case 'squawk_returned_to_service':
      return createElement(
        SquawkReturnedToService,
        p as unknown as Parameters<typeof SquawkReturnedToService>[0],
      );
    case 'document_expiring':
      return createElement(
        DocumentExpiring,
        p as unknown as Parameters<typeof DocumentExpiring>[0],
      );
    case 'currency_expiring':
      return createElement(
        CurrencyExpiring,
        p as unknown as Parameters<typeof CurrencyExpiring>[0],
      );
    case 'admin_broadcast':
      return createElement(AdminBroadcast, p as unknown as Parameters<typeof AdminBroadcast>[0]);
    case 'duty_hour_warning':
      return createElement(DutyHourWarning, p as unknown as Parameters<typeof DutyHourWarning>[0]);
    default:
      throw new Error(`Unknown email template: ${key}`);
  }
}
