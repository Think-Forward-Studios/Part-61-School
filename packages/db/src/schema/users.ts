import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mechanicAuthorityEnum, roleEnum, userStatusEnum } from './enums';
import { schools } from './tenancy';

/**
 * Users & user_roles.
 *
 * IMPORTANT: users.id mirrors Supabase auth.users.id. It is NOT
 * defaultRandom — Supabase Auth generates the UUID at signup and we
 * insert a matching public.users row via the custom access token hook
 * flow (or an admin-invite tRPC procedure). Migrations should add
 * `references auth.users(id) on delete cascade` once the auth schema
 * is in place; we declare the column without that FK here so the
 * migration generator doesn't fail before supabase start.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    email: text('email').notNull().unique(),
    fullName: text('full_name'),
    timezone: text('timezone'), // nullable; falls back to schools.timezone
    // PER-02: lifecycle status. 'pending' rows exist BEFORE auth.users
    // is created (self-registration approval queue). Default 'active'
    // matches existing Phase 1 invite-flow behavior.
    status: userStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('users_status_idx').on(t.status),
    pgPolicy('users_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('users_update_own_school', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: roleEnum('role').notNull(),
    mechanicAuthority: mechanicAuthorityEnum('mechanic_authority')
      .notNull()
      .default('none'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('user_roles_user_role_unique').on(t.userId, t.role),
    pgPolicy('user_roles_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`user_id in (select id from public.users where school_id = (auth.jwt() ->> 'school_id')::uuid)`,
    }),
    pgPolicy('user_roles_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`user_id in (select id from public.users where school_id = (auth.jwt() ->> 'school_id')::uuid)`,
      withCheck: sql`user_id in (select id from public.users where school_id = (auth.jwt() ->> 'school_id')::uuid)`,
    }),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
