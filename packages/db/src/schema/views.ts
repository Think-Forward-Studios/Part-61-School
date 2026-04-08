import { numeric, pgView, timestamp, uuid } from 'drizzle-orm/pg-core';
import { enginePositionEnum } from './enums';

/**
 * Read-only views over the append-only flight_log_entry table.
 *
 * These are declared with `.existing()` because the SQL DDL is
 * hand-authored in the migration. Drizzle-kit will not attempt to
 * CREATE or DROP them — Drizzle only uses the shape here for
 * type-safe SELECTs from the application layer.
 *
 * CRITICAL: the migration creates both views with
 * `WITH (security_invoker = true)` so RLS on flight_log_entry /
 * aircraft / aircraft_engine flows through. Without that opt-in,
 * Postgres runs view queries as the view owner and bypasses RLS.
 */

export const aircraftCurrentTotals = pgView('aircraft_current_totals', {
  aircraftId: uuid('aircraft_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  baseId: uuid('base_id').notNull(),
  currentHobbs: numeric('current_hobbs', { precision: 12, scale: 1 }),
  currentTach: numeric('current_tach', { precision: 12, scale: 1 }),
  currentAirframe: numeric('current_airframe', { precision: 12, scale: 1 }),
  lastFlownAt: timestamp('last_flown_at', { withTimezone: true }),
}).existing();

export const aircraftEngineCurrentTotals = pgView(
  'aircraft_engine_current_totals',
  {
    aircraftId: uuid('aircraft_id').notNull(),
    schoolId: uuid('school_id').notNull(),
    baseId: uuid('base_id').notNull(),
    engineId: uuid('engine_id').notNull(),
    position: enginePositionEnum('position').notNull(),
    currentEngineHours: numeric('current_engine_hours', {
      precision: 12,
      scale: 1,
    }),
  },
).existing();
