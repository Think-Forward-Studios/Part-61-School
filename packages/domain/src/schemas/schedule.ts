/**
 * Phase 3 scheduling + dispatch + FIF Zod schemas.
 */
import { z } from 'zod';

const uuid = z.string().regex(/^[0-9a-fA-F-]{36}$/);

export const reservationActivityType = z.enum([
  'flight',
  'simulator',
  'oral',
  'academic',
  'misc',
]);
export type ReservationActivityType = z.infer<typeof reservationActivityType>;

export const reservationStatus = z.enum([
  'requested',
  'approved',
  'dispatched',
  'flown',
  'pending_sign_off',
  'closed',
  'cancelled',
  'no_show',
  'scrubbed',
]);

export const closeOutReasonSchema = z.enum([
  'cancelled_free',
  'cancelled_late',
  'no_show',
  'scrubbed_weather',
  'scrubbed_maintenance',
  'scrubbed_other',
]);

export const squawkSeverity = z.enum(['info', 'watch', 'grounding']);
export const fifSeverity = z.enum(['info', 'important', 'critical']);

// ----------------------------------------------------------------------
// Reservations
// ----------------------------------------------------------------------

export const reservationRequestInput = z
  .object({
    activityType: reservationActivityType,
    aircraftId: uuid.optional().nullable(),
    instructorId: uuid.optional().nullable(),
    studentId: uuid.optional().nullable(),
    roomId: uuid.optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    notes: z.string().max(5000).optional().nullable(),
    parentBlockInstanceId: uuid.optional().nullable(),
    routeString: z.string().max(1000).optional().nullable(),
    eteMinutes: z.number().int().min(0).max(10_000).optional().nullable(),
    stops: z.array(z.string().max(20)).optional().nullable(),
    fuelStops: z.array(z.string().max(20)).optional().nullable(),
    alternate: z.string().max(20).optional().nullable(),
    recurrence: z
      .object({
        frequency: z.enum(['daily', 'weekly']),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
        count: z.number().int().min(1).max(104).optional(),
        until: z.coerce.date().optional(),
      })
      .optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'endsAt must be after startsAt',
  });
export type ReservationRequestInput = z.infer<typeof reservationRequestInput>;

export const reservationIdInput = z.object({ reservationId: uuid });

export const reservationApproveInput = reservationIdInput;

export const reservationListInput = z.object({
  mode: z.enum(['mine', 'full', 'freebusy']).default('mine'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  aircraftId: uuid.optional(),
  instructorId: uuid.optional(),
  resourceType: z.enum(['aircraft', 'instructor', 'student', 'room']).optional(),
  resourceId: uuid.optional(),
});

export const reservationCancelInput = z.object({
  reservationId: uuid,
  reason: z.enum([
    'cancelled_free',
    'cancelled_late',
    'scrubbed_weather',
    'scrubbed_maintenance',
    'scrubbed_other',
  ]).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const reservationMarkNoShowInput = z.object({
  reservationId: uuid,
  notes: z.string().max(1000).optional().nullable(),
});

export const reservationUpdateInput = z.object({
  reservationId: uuid,
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  notes: z.string().max(5000).optional().nullable(),
  routeString: z.string().max(1000).optional().nullable(),
});

// ----------------------------------------------------------------------
// Blocks
// ----------------------------------------------------------------------

export const blockCreateInput = z.object({
  kind: z.enum(['instructor_block', 'aircraft_block', 'room_block', 'combo']),
  instructorId: uuid.optional().nullable(),
  aircraftId: uuid.optional().nullable(),
  roomId: uuid.optional().nullable(),
  instances: z
    .array(
      z
        .object({ startsAt: z.coerce.date(), endsAt: z.coerce.date() })
        .refine((v) => v.endsAt > v.startsAt, { message: 'endsAt > startsAt' }),
    )
    .min(1),
  notes: z.string().max(2000).optional().nullable(),
});

export const blockDeleteInput = z.object({ blockId: uuid });

// ----------------------------------------------------------------------
// Free/busy
// ----------------------------------------------------------------------

export const freeBusyInput = z.object({
  resourceType: z.enum(['aircraft', 'instructor', 'student', 'room']),
  resourceId: uuid,
  from: z.coerce.date(),
  to: z.coerce.date(),
});

// ----------------------------------------------------------------------
// Rooms
// ----------------------------------------------------------------------

export const roomCreateInput = z.object({
  name: z.string().min(1).max(200),
  capacity: z.number().int().min(0).max(10_000).optional().nullable(),
  features: z.array(z.string().max(100)).optional(),
  baseId: uuid.optional(),
});

export const roomUpdateInput = z.object({
  roomId: uuid,
  name: z.string().min(1).max(200).optional(),
  capacity: z.number().int().min(0).max(10_000).optional().nullable(),
  features: z.array(z.string().max(100)).optional(),
});

export const roomIdInput = z.object({ roomId: uuid });

// ----------------------------------------------------------------------
// Dispatch
// ----------------------------------------------------------------------

export const dispatchMarkStudentPresentInput = reservationIdInput;
export const dispatchAuthorizeInput = reservationIdInput;

export const dispatchFlightInput = z.object({
  reservationId: uuid,
  hobbsOut: z.number().min(0).optional().nullable(),
  tachOut: z.number().min(0).optional().nullable(),
});

export const dispatchCloseOutInput = z.object({
  reservationId: uuid,
  hobbsIn: z.number().min(0).optional().nullable(),
  tachIn: z.number().min(0).optional().nullable(),
  fuelGal: z.number().min(0).optional().nullable(),
  oilQt: z.number().min(0).optional().nullable(),
  routeFlown: z.string().max(1000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  signedOffByInstructor: z.boolean().default(false),
  squawks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional().nullable(),
        severity: squawkSeverity,
      }),
    )
    .default([]),
});

export const openSquawkInput = z.object({
  aircraftId: uuid,
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  severity: squawkSeverity,
});

export const resolveSquawkInput = z.object({
  squawkId: uuid,
  resolutionNotes: z.string().max(5000).optional().nullable(),
});

export const passengerManifestUpsertInput = z.object({
  reservationId: uuid,
  rows: z
    .array(
      z.object({
        position: z.enum(['pic', 'sic', 'passenger']),
        name: z.string().min(1).max(200),
        weightLbs: z.number().min(0).max(2000).optional().nullable(),
        emergencyContactName: z.string().max(200).optional().nullable(),
        emergencyContactPhone: z.string().max(50).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
      }),
    )
    .default([]),
});

// ----------------------------------------------------------------------
// FIF
// ----------------------------------------------------------------------

export const fifPostInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  severity: fifSeverity.default('info'),
  baseId: uuid.optional().nullable(),
  effectiveAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const fifIdInput = z.object({ noticeId: uuid });
