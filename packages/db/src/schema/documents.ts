import { sql } from 'drizzle-orm';
import {
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { documentKindEnum } from './enums';
import { schools } from './tenancy';
import { users } from './users';

/**
 * documents — Phase 1 personal-document storage metadata.
 *
 * Files themselves live in Supabase Storage at
 *   school_{schoolId}/user_{userId}/{documentId}
 * (see CONTEXT §Document Storage). This table holds metadata only.
 *
 * Hard delete is BLOCKED by a BEFORE DELETE trigger
 * (fn_block_hard_delete) attached in the migration. Soft delete sets
 * deleted_at, which the audit trigger detects and records as a
 * 'soft_delete' action.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: documentKindEnum('kind').notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('documents_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('documents_insert_own_school', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('documents_update_own_school', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    // No DELETE policy: hard deletes are also blocked at trigger level.
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
