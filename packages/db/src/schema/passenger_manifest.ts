import { sql } from 'drizzle-orm';
import {
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { manifestPositionEnum } from './enums';
import { reservation } from './reservations';

/**
 * passenger_manifest (FTR-06).
 *
 * Pax do NOT need to be users — free-text name + weight + emergency
 * contact. One row per occupant. PIC + SIC are also rows here so the
 * manifest is the canonical "who's on the plane" list.
 */
export const passengerManifest = pgTable(
  'passenger_manifest',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservation.id),
    position: manifestPositionEnum('position').notNull(),
    name: text('name').notNull(),
    weightLbs: numeric('weight_lbs', { precision: 6, scale: 1 }),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    pgPolicy('passenger_manifest_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`reservation_id in (select id from public.reservation)`,
    }),
    pgPolicy('passenger_manifest_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`reservation_id in (select id from public.reservation)`,
      withCheck: sql`reservation_id in (select id from public.reservation)`,
    }),
  ],
);

export type PassengerManifest = typeof passengerManifest.$inferSelect;
export type NewPassengerManifest = typeof passengerManifest.$inferInsert;
