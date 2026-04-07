import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Phase 1 enums. These types are referenced from multiple schema modules
 * and from the custom_access_token_hook SQL function, so they live here
 * in isolation rather than next to one specific table.
 */

// AUTH-06: four-role system
export const roleEnum = pgEnum('role', [
  'student',
  'instructor',
  'mechanic',
  'admin',
]);

// AUTH-07: mechanic sub-authority. 'none' is the default for non-mechanic
// users; 'ia' implies 'a_and_p' at the application layer.
export const mechanicAuthorityEnum = pgEnum('mechanic_authority', [
  'none',
  'a_and_p',
  'ia',
]);

// FND-01: Phase 1 document kinds. Future phases may add more.
export const documentKindEnum = pgEnum('document_kind', [
  'medical',
  'pilot_license',
  'government_id',
  'insurance',
]);

// FND-03: audit action enum. 'soft_delete' is recorded when an UPDATE
// transitions deleted_at from NULL to non-NULL.
export const auditActionEnum = pgEnum('audit_action', [
  'insert',
  'update',
  'soft_delete',
]);
