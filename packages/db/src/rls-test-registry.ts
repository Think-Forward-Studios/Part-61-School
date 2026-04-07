/**
 * RLS test registry.
 *
 * Every business table that ends up under cross-tenant coverage
 * registers itself here with a `seed` function. The cross-tenant test
 * harness (tests/rls/cross-tenant.test.ts) iterates the registry and
 * asserts isolation for every entry — so adding a new table to a
 * later phase without registering it here will leave it untested,
 * which the schema-PR template flags.
 *
 * Phase 1 registrations live in this file directly to keep the
 * dependency surface small. Future phases may either edit this file
 * or import `registerForRlsTest` from their own schema modules.
 */

export interface RlsTestableTable {
  /** Unqualified Postgres table name, e.g. 'documents'. */
  name: string;
  /**
   * Seed one row for the given school/user using a superuser DB
   * handle. Must return the inserted row's id so the harness can
   * cross-check it across tenants.
   */
  seed: (
    db: unknown,
    schoolId: string,
    userId: string,
  ) => Promise<{ id: string }>;
}

export const tables: RlsTestableTable[] = [];

export function registerForRlsTest(t: RlsTestableTable): void {
  if (tables.find((x) => x.name === t.name)) return;
  tables.push(t);
}

// ---------------------------------------------------------------------
// Phase 1 registrations
// ---------------------------------------------------------------------
// These are intentionally declared as plain objects (not importing the
// Drizzle schema) so this registry stays usable from both Drizzle and
// raw `postgres` clients in tests/rls.

registerForRlsTest({
  name: 'bases',
  seed: async (db, schoolId) => {
    const sqlClient = db as {
      unsafe?: (q: string) => Promise<Array<{ id: string }>>;
    };
    if (!sqlClient.unsafe) throw new Error('expected postgres-js client');
    const rows = await sqlClient.unsafe(
      `insert into public.bases (school_id, name) values ('${schoolId}', 'rls-seed-base') returning id`,
    );
    return { id: rows[0]!.id };
  },
});

registerForRlsTest({
  name: 'users',
  // users are seeded by the harness directly (they exist before any
  // other table can reference them), so this entry is a no-op
  // marker — the harness uses it only to know users is in scope.
  seed: async (_db, _schoolId, userId) => ({ id: userId }),
});

registerForRlsTest({
  name: 'user_roles',
  seed: async (db, _schoolId, userId) => {
    const sqlClient = db as {
      unsafe?: (q: string) => Promise<Array<{ id: string }>>;
    };
    if (!sqlClient.unsafe) throw new Error('expected postgres-js client');
    const rows = await sqlClient.unsafe(
      `insert into public.user_roles (user_id, role, is_default) values ('${userId}', 'admin', true) returning id`,
    );
    return { id: rows[0]!.id };
  },
});

registerForRlsTest({
  name: 'documents',
  seed: async (db, schoolId, userId) => {
    const sqlClient = db as {
      unsafe?: (q: string) => Promise<Array<{ id: string }>>;
    };
    if (!sqlClient.unsafe) throw new Error('expected postgres-js client');
    const rows = await sqlClient.unsafe(
      `insert into public.documents
         (school_id, user_id, kind, storage_path, mime_type, byte_size, uploaded_by)
       values
         ('${schoolId}', '${userId}', 'medical',
          'school_${schoolId}/user_${userId}/seed', 'application/pdf', 1024,
          '${userId}')
       returning id`,
    );
    return { id: rows[0]!.id };
  },
});
