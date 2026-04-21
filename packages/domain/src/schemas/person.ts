/**
 * Person / user Zod schemas (PER-01..10, ADM-01..04).
 *
 * Shared between the tRPC routers (server-side validation) and the
 * admin UI forms in Plan 04. Role / enum literals are duplicated from
 * @part61/db enums on purpose — @part61/domain must not depend on the
 * db package (avoids a typecheck cycle for non-server consumers).
 */
import { z } from 'zod';

export const roleSchema = z.enum(['student', 'instructor', 'mechanic', 'admin', 'rental_customer']);
export type Role = z.infer<typeof roleSchema>;

export const mechanicAuthoritySchema = z.enum(['none', 'a_and_p', 'ia']);

export const userStatusSchema = z.enum(['pending', 'active', 'inactive', 'rejected']);

export const citizenshipStatusSchema = z.enum([
  'us_citizen',
  'us_national',
  'foreign_national',
  'unknown',
]);

export const tsaAfspStatusSchema = z.enum(['not_required', 'pending', 'approved', 'expired']);

export const holdKindSchema = z.enum(['hold', 'grounding']);
export const currencyKindSchema = z.enum(['cfi', 'cfii', 'mei', 'medical', 'bfr', 'ipc']);
export const qualificationKindSchema = z.enum([
  'aircraft_type',
  'sim_authorization',
  'course_authorization',
]);

// ---- person_profile --------------------------------------------------------

const personProfileFields = {
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  addressLine1: z.string().max(500).optional().nullable(),
  addressLine2: z.string().max(500).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  emailAlt: z.string().email().optional().nullable(),
  faaAirmanCertNumber: z.string().max(50).optional().nullable(),
  citizenshipStatus: citizenshipStatusSchema.optional().nullable(),
  tsaAfspStatus: tsaAfspStatusSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
};

export const createPersonInput = z.object({
  email: z.string().email(),
  role: roleSchema,
  mechanicAuthority: mechanicAuthoritySchema.optional().default('none'),
  ...personProfileFields,
});
export type CreatePersonInput = z.infer<typeof createPersonInput>;

export const updatePersonInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(200).optional(),
  lastName: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  // Admin-managed legal-status fields (PER-01). These are intentionally
  // NOT writable via self-profile (see me.updateProfile); only an admin
  // can set/change them after verification of the underlying documents.
  citizenshipStatus: citizenshipStatusSchema.optional().nullable(),
  tsaAfspStatus: tsaAfspStatusSchema.optional().nullable(),
});
export type UpdatePersonInput = z.infer<typeof updatePersonInput>;

export const userIdInput = z.object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) });

export const listPeopleInput = z.object({
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const assignRoleInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  role: roleSchema,
  mechanicAuthority: mechanicAuthoritySchema.optional().default('none'),
});

export const removeRoleInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  role: roleSchema,
});

export const rejectRegistrationInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  reason: z.string().min(1).max(1000),
});

export const registerSubmitInput = z.object({
  schoolId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  email: z.string().email(),
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  requestedRole: z.enum(['student', 'rental_customer']),
});

// ---- holds -----------------------------------------------------------------

export const holdCreateInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  kind: holdKindSchema,
  reason: z.string().min(1).max(1000),
});

export const holdClearInput = z.object({
  holdId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  clearedReason: z.string().min(1).max(1000),
});

// ---- currencies ------------------------------------------------------------

export const currencyCreateInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  kind: currencyKindSchema,
  effectiveAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  documentId: z
    .string()
    .regex(/^[0-9a-fA-F-]{36}$/)
    .optional()
    .nullable(),
});

export const currencyUpdateInput = currencyCreateInput.extend({
  currencyId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

// ---- qualifications --------------------------------------------------------

export const qualificationCreateInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  kind: qualificationKindSchema,
  descriptor: z.string().min(1).max(500),
  notes: z.string().max(2000).optional().nullable(),
});

export const qualificationUpdateInput = qualificationCreateInput.extend({
  qualificationId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

export const qualificationRevokeInput = z.object({
  qualificationId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

// ---- emergency contacts ----------------------------------------------------

export const emergencyContactCreateInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  name: z.string().min(1).max(200),
  relationship: z.string().max(100).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const emergencyContactUpdateInput = emergencyContactCreateInput.extend({
  contactId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

export const emergencyContactDeleteInput = z.object({
  contactId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

// ---- info releases ---------------------------------------------------------

export const infoReleaseCreateInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  name: z.string().min(1).max(200),
  relationship: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const infoReleaseRevokeInput = z.object({
  releaseId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

// ---- experience ------------------------------------------------------------

export const experienceCreateInput = z.object({
  userId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  totalTime: z.number().nonnegative().optional().nullable(),
  picTime: z.number().nonnegative().optional().nullable(),
  instructorTime: z.number().nonnegative().optional().nullable(),
  multiEngineTime: z.number().nonnegative().optional().nullable(),
  instrumentTime: z.number().nonnegative().optional().nullable(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(['self_reported', 'imported', 'derived']).optional().default('self_reported'),
  notes: z.string().max(2000).optional().nullable(),
});

export const experienceUpdateInput = experienceCreateInput.extend({
  experienceId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});
