/**
 * Aircraft Zod schemas (FLT-01, FLT-05, FLT-06, ADM-05).
 */
import { z } from 'zod';

export const enginePositionSchema = z.enum([
  'single',
  'left',
  'right',
  'center',
  'n1',
  'n2',
  'n3',
  'n4',
]);

export const aircraftEquipmentTagSchema = z.enum([
  'ifr_equipped',
  'complex',
  'high_performance',
  'glass_panel',
  'autopilot',
  'ads_b_out',
  'ads_b_in',
  'gtn_650',
  'gtn_750',
  'g1000',
  'g3x',
  'garmin_530',
  'kln_94',
  'tail_dragger',
  'retractable_gear',
]);
export type AircraftEquipmentTag = z.infer<typeof aircraftEquipmentTagSchema>;

export const createAircraftInput = z.object({
  tailNumber: z.string().min(1).max(20),
  make: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  equipmentNotes: z.string().max(5000).optional().nullable(),
  baseId: z.string().regex(/^[0-9a-fA-F-]{36}$/).optional(),
});
export type CreateAircraftInput = z.infer<typeof createAircraftInput>;

export const updateAircraftInput = z.object({
  aircraftId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  tailNumber: z.string().min(1).max(20).optional(),
  make: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  equipmentNotes: z.string().max(5000).optional().nullable(),
  baseId: z.string().regex(/^[0-9a-fA-F-]{36}$/).optional(),
});

export const aircraftIdInput = z.object({
  aircraftId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

export const addEngineInput = z.object({
  aircraftId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  position: enginePositionSchema,
  serialNumber: z.string().max(100).optional().nullable(),
  installedAt: z.coerce.date().optional().nullable(),
});

export const removeEngineInput = z.object({
  engineId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

export const setEquipmentInput = z.object({
  aircraftId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  tags: z.array(aircraftEquipmentTagSchema),
});

export const listAircraftInput = z.object({
  baseId: z.string().regex(/^[0-9a-fA-F-]{36}$/).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

// School settings
export const updateSchoolInput = z.object({
  name: z.string().min(1).max(500).optional(),
  timezone: z
    .string()
    .min(1)
    .refine(
      (tz) => {
        try {
          // throws RangeError for invalid zones
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid IANA timezone' },
    )
    .optional(),
  defaultBaseId: z.string().regex(/^[0-9a-fA-F-]{36}$/).optional().nullable(),
});
