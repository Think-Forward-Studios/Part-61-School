/**
 * Flight log Zod schemas (FLT-02, FLT-03).
 *
 * Append-only: no update schema, no delete schema. Corrections are
 * new rows with kind='correction' and correctsId set.
 */
import { z } from 'zod';

export const flightLogEntryKindSchema = z.enum([
  'flight',
  'baseline',
  'correction',
]);

export const engineDeltaSchema = z.object({
  engineId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  deltaHours: z.number().nonnegative(),
});

export const flightLogEntryCreateInput = z.object({
  aircraftId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  flownAt: z.coerce.date(),
  hobbsOut: z.number().nonnegative().optional().nullable(),
  hobbsIn: z.number().nonnegative().optional().nullable(),
  tachOut: z.number().nonnegative().optional().nullable(),
  tachIn: z.number().nonnegative().optional().nullable(),
  airframeDelta: z.number().nonnegative().default(0),
  notes: z.string().max(5000).optional().nullable(),
  engineDeltas: z.array(engineDeltaSchema).default([]),
});
export type FlightLogEntryCreateInput = z.infer<
  typeof flightLogEntryCreateInput
>;

export const flightLogCorrectionCreateInput = z.object({
  correctsId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  flownAt: z.coerce.date(),
  hobbsOut: z.number().nonnegative().optional().nullable(),
  hobbsIn: z.number().nonnegative().optional().nullable(),
  tachOut: z.number().nonnegative().optional().nullable(),
  tachIn: z.number().nonnegative().optional().nullable(),
  airframeDelta: z.number().default(0),
  notes: z.string().max(5000).optional().nullable(),
  engineDeltas: z.array(engineDeltaSchema).default([]),
});

export const flightLogListInput = z.object({
  aircraftId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  limit: z.number().int().min(1).max(500).default(100),
});
