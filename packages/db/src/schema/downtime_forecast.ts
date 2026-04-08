import { sql } from 'drizzle-orm';
import { numeric, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { aircraft } from './aircraft';
import { schools } from './tenancy';

/**
 * aircraft_downtime_forecast (MNT-11).
 *
 * Cache table maintained by `aircraft_next_grounding_forecast(...)`
 * (Plan 04-02). One row per aircraft. Refreshed on every flight log
 * insert and on maintenance item completion.
 */
export const aircraftDowntimeForecast = pgTable(
  'aircraft_downtime_forecast',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .unique()
      .references(() => aircraft.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    nextEventAt: timestamp('next_event_at', { withTimezone: true }),
    nextEventHours: numeric('next_event_hours'),
    reason: text('reason'),
    confidence: text('confidence'),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('aircraft_downtime_forecast_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('aircraft_downtime_forecast_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type AircraftDowntimeForecast = typeof aircraftDowntimeForecast.$inferSelect;
