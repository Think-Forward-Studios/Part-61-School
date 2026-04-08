import { sql } from 'drizzle-orm';
import {
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { fifSeverityEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * Flight Information File (FTR-07).
 *
 * Admins post notices; pilots must acknowledge active notices before
 * dispatch. The dispatch modal blocks until all unacked active notices
 * for the dispatching user have ack rows.
 */
export const fifNotice = pgTable(
  'fif_notice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    severity: fifSeverityEnum('severity').notNull().default('info'),
    postedAt: timestamp('posted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    postedBy: uuid('posted_by').references(() => users.id),
    effectiveAt: timestamp('effective_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('fif_notice_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('fif_notice_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export const fifAcknowledgement = pgTable(
  'fif_acknowledgement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => fifNotice.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('fif_ack_notice_user_unique').on(t.noticeId, t.userId),
    pgPolicy('fif_ack_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('fif_ack_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type FifNotice = typeof fifNotice.$inferSelect;
export type NewFifNotice = typeof fifNotice.$inferInsert;
export type FifAcknowledgement = typeof fifAcknowledgement.$inferSelect;
export type NewFifAcknowledgement = typeof fifAcknowledgement.$inferInsert;
