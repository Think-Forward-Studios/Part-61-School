/**
 * interval_rule JSONB validator (MNT-02).
 *
 * Discriminated union on `clock`. Rejects negative hours / months,
 * garbage modes, and missing required fields. Returned shape is the
 * authoritative TS type for every interval_rule column.
 */
import { z } from 'zod';

const positiveHours = z.number().positive().finite();
const positiveMonths = z.number().int().positive();

export const intervalRuleSchema = z.discriminatedUnion('clock', [
  z.object({ clock: z.literal('hobbs'), hours: positiveHours }),
  z.object({ clock: z.literal('tach'), hours: positiveHours }),
  z.object({ clock: z.literal('airframe'), hours: positiveHours }),
  z.object({ clock: z.literal('engine'), hours: positiveHours }),
  z.object({ clock: z.literal('calendar'), months: positiveMonths }),
  z.object({
    clock: z.literal('combined'),
    hours: positiveHours,
    months: positiveMonths,
    mode: z.enum(['whichever_first', 'whichever_last']).default('whichever_first'),
  }),
]);

export type IntervalRule = z.infer<typeof intervalRuleSchema>;
