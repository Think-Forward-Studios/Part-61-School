/**
 * Phase 1 schema barrel.
 *
 * Order matters for readers, not for Drizzle: enums first, then tenancy
 * (schools is the FK target for everything), then users, then documents,
 * then audit_log.
 */
export * from './enums';
export * from './tenancy';
export * from './users';
export * from './documents';
export * from './audit';
