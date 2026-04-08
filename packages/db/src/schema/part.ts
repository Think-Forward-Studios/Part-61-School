import { sql } from 'drizzle-orm';
import { numeric, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { partKindEnum, partUnitEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * part + part_lot (MNT-08).
 *
 * Inventory tables. Lot-tracked parts decrement `part_lot.qty_remaining`
 * via the parts-consumption mutation; non-lot parts decrement
 * `part.on_hand_qty` directly.
 */
export const part = pgTable(
  'part',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    partNumber: text('part_number').notNull(),
    description: text('description'),
    manufacturer: text('manufacturer'),
    kind: partKindEnum('kind').notNull(),
    unit: partUnitEnum('unit').notNull(),
    onHandQty: numeric('on_hand_qty').notNull().default('0'),
    minReorderQty: numeric('min_reorder_qty'),
    preferredSupplier: text('preferred_supplier'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('part_select_own_school_base', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
          or base_id is null
        )
      `,
    }),
    pgPolicy('part_modify_own_school_base', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
          or base_id is null
        )
      `,
      withCheck: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
          or base_id is null
        )
      `,
    }),
  ],
);

export const partLot = pgTable(
  'part_lot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => part.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    lotNumber: text('lot_number'),
    serialNumber: text('serial_number'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    receivedBy: uuid('received_by').references(() => users.id),
    receivedQty: numeric('received_qty').notNull(),
    qtyRemaining: numeric('qty_remaining').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    supplier: text('supplier'),
    invoiceRef: text('invoice_ref'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('part_lot_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('part_lot_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type Part = typeof part.$inferSelect;
export type PartLot = typeof partLot.$inferSelect;
