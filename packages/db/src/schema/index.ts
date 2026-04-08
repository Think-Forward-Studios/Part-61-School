/**
 * Schema barrel.
 *
 * Order matters for readers, not for Drizzle: enums first, then
 * tenancy (schools/bases as the FK root), then users, then
 * documents/audit, then the Phase 2 modules.
 */
export * from './enums';
export * from './tenancy';
export * from './users';
export * from './documents';
export * from './audit';

// Phase 2 modules
export * from './personnel';
export * from './holds';
export * from './currencies';
export * from './qualifications';
export * from './no_show';
export * from './enrollment';
export * from './aircraft';
export * from './flight_log';
export * from './user_base';
export * from './views';

// Phase 3 modules
export * from './reservations';
export * from './rooms';
export * from './squawks';
export * from './schedule_blocks';
export * from './fif';
export * from './passenger_manifest';
export * from './person_unavailability';
