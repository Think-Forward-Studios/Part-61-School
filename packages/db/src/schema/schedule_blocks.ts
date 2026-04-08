import { sql } from 'drizzle-orm';
import {
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aircraft } from './aircraft';
import { blockKindEnum } from './enums';
import { tstzrange } from './reservations';
import { room } from './rooms';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * schedule_block + schedule_block_instance (SCH-16).
 *
 * Admins pre-define blocks ("instructor block every Tue/Thu 09:00-12:00",
 * "aircraft block weekend mornings"). Block instances are materialized
 * children. Students book by creating a reservation with parent_block_id
 * pointing at an instance.
 *
 * NOTE: schedule_block_instance is NOT a reservation row — it just
 * provides a bookable slot. The exclusion constraint sees the resulting
 * reservation, not the block.
 */
export const scheduleBlock = pgTable(
  'schedule_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    kind: blockKindEnum('kind').notNull(),
    instructorId: uuid('instructor_id').references(() => users.id),
    aircraftId: uuid('aircraft_id').references(() => aircraft.id),
    roomId: uuid('room_id').references(() => room.id),
    recurrenceRule: jsonb('recurrence_rule'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('schedule_block_select_own_school_base', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
    }),
    pgPolicy('schedule_block_modify_own_school_base', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
      withCheck: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
    }),
  ],
);

export const scheduleBlockInstance = pgTable(
  'schedule_block_instance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockId: uuid('block_id')
      .notNull()
      .references(() => scheduleBlock.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    timeRange: tstzrange('time_range').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    pgPolicy('schedule_block_instance_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`block_id in (select id from public.schedule_block)`,
    }),
    pgPolicy('schedule_block_instance_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`block_id in (select id from public.schedule_block)`,
      withCheck: sql`block_id in (select id from public.schedule_block)`,
    }),
  ],
);

export type ScheduleBlock = typeof scheduleBlock.$inferSelect;
export type NewScheduleBlock = typeof scheduleBlock.$inferInsert;
export type ScheduleBlockInstance = typeof scheduleBlockInstance.$inferSelect;
export type NewScheduleBlockInstance =
  typeof scheduleBlockInstance.$inferInsert;
