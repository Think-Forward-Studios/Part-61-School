/**
 * AD applicability JSONB validator (MNT-07).
 *
 * All fields optional — missing means "any." Year range is a tuple of
 * two ints (inclusive). Serial range is a tuple of two strings.
 */
import { z } from 'zod';

export const adApplicabilitySchema = z.object({
  aircraft_make: z.string().optional(),
  aircraft_model: z.string().optional(),
  year_range: z.tuple([z.number().int(), z.number().int()]).optional(),
  serial_range: z.tuple([z.string(), z.string()]).optional(),
  engine_make: z.string().optional(),
  engine_model: z.string().optional(),
  prop_make: z.string().optional(),
  prop_model: z.string().optional(),
});

export type AdApplicability = z.infer<typeof adApplicabilitySchema>;
