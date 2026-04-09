/**
 * RLS test harness.
 *
 * Provides:
 *   - dbAsAdmin(): a postgres-js client connected as the superuser
 *     (DIRECT_DATABASE_URL); used to seed and to run privileged
 *     assertions that bypass RLS.
 *   - asUserOf(userId, schoolId, activeRole): returns a function
 *     that runs SQL as if the caller were an authenticated user with
 *     the given JWT claims. It does this by setting `request.jwt.claims`
 *     and switching to the `authenticated` Postgres role for the
 *     duration of a single statement (or block of statements).
 *   - seedTwoSchools(): truncates Phase 1 tables and reinserts the
 *     two-school fixture defined in supabase/seed.sql, returning the
 *     ids the tests need.
 *
 * Why not use @supabase/supabase-js?
 *   We want to test RLS directly against Postgres with synthesized JWT
 *   claims. Going through the real auth server would (a) be much
 *   slower, (b) couple these tests to the auth hook implementation
 *   which is tested separately, and (c) make failures harder to
 *   localize. The `request.jwt.claims` GUC is the same value Supabase
 *   sets when it forwards a real JWT, so policies that read
 *   `auth.jwt() ->> 'school_id'` see identical input.
 */
import postgres, { type Sql } from 'postgres';

const DIRECT_URL =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:54322/postgres';

let adminClient: Sql | null = null;

export function dbAsAdmin(): Sql {
  if (!adminClient) {
    adminClient = postgres(DIRECT_URL, {
      prepare: false,
      max: 4,
      onnotice: () => {},
    });
  }
  return adminClient;
}

export async function closeAdmin(): Promise<void> {
  if (adminClient) {
    await adminClient.end({ timeout: 5 });
    adminClient = null;
  }
}

// Hard-coded UUIDs match supabase/seed.sql
export const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
export const SCHOOL_B = '22222222-2222-2222-2222-222222222222';
export const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const BASE_A = 'cccccccc-cccc-cccc-cccc-cccccccccc01';
export const BASE_B = 'cccccccc-cccc-cccc-cccc-cccccccccc02';

export interface SeedResult {
  schoolA: string;
  schoolB: string;
  userA: string;
  userB: string;
  baseA: string;
  baseB: string;
  docA: string;
  docB: string;
}

/**
 * Reset Phase 1 tables to a known two-school fixture and return the
 * ids the cross-tenant tests need. Safe to call repeatedly.
 *
 * Uses session_replication_role=replica during DML so the audit
 * trigger doesn't pollute audit_log with seed rows (the tests assert
 * exact audit_log row counts).
 */
export async function seedTwoSchools(): Promise<SeedResult> {
  const sql = dbAsAdmin();

  await sql.unsafe(`set session_replication_role = replica`);
  await sql.unsafe(`
    truncate table
      public.audit_log,
      public.line_item_grade,
      public.lesson_grade_sheet,
      public.stage_check,
      public.student_endorsement,
      public.flight_log_time,
      public.line_item,
      public.lesson,
      public.unit,
      public.course_phase,
      public.stage,
      public.course_version,
      public.course,
      public.flight_log_entry_engine,
      public.flight_log_entry,
      public.aircraft_equipment,
      public.aircraft_engine,
      public.aircraft,
      public.no_show,
      public.student_course_enrollment,
      public.instructor_experience,
      public.personnel_currency,
      public.instructor_qualification,
      public.person_hold,
      public.emergency_contact,
      public.info_release_authorization,
      public.person_profile,
      public.user_base,
      public.documents,
      public.user_roles,
      public.users,
      public.bases,
      public.schools
    restart identity cascade
  `);

  await sql.unsafe(`
    insert into public.schools (id, name, timezone) values
      ('${SCHOOL_A}', 'Alpha Flight Academy', 'America/Chicago'),
      ('${SCHOOL_B}', 'Bravo Aviation School', 'America/Los_Angeles')
  `);
  await sql.unsafe(`
    insert into public.bases (id, school_id, name, timezone) values
      ('${BASE_A}', '${SCHOOL_A}', 'Alpha Main', 'America/Chicago'),
      ('${BASE_B}', '${SCHOOL_B}', 'Bravo Main', 'America/Los_Angeles')
  `);
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone) values
      ('${USER_A}', '${SCHOOL_A}', 'admin-a@alpha.test', 'Alpha Admin', 'America/Chicago'),
      ('${USER_B}', '${SCHOOL_B}', 'admin-b@bravo.test', 'Bravo Admin', 'America/Los_Angeles')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${USER_A}', 'admin', 'none', true),
      ('${USER_B}', 'admin', 'none', true)
  `);

  const docARows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.documents
      (school_id, user_id, kind, storage_path, mime_type, byte_size, uploaded_by)
    values
      ('${SCHOOL_A}', '${USER_A}', 'medical',
       'school_${SCHOOL_A}/user_${USER_A}/seed', 'application/pdf', 1024, '${USER_A}')
    returning id
  `);
  const docBRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.documents
      (school_id, user_id, kind, storage_path, mime_type, byte_size, uploaded_by)
    values
      ('${SCHOOL_B}', '${USER_B}', 'medical',
       'school_${SCHOOL_B}/user_${USER_B}/seed', 'application/pdf', 1024, '${USER_B}')
    returning id
  `);

  await sql.unsafe(`set session_replication_role = origin`);

  return {
    schoolA: SCHOOL_A,
    schoolB: SCHOOL_B,
    userA: USER_A,
    userB: USER_B,
    baseA: BASE_A,
    baseB: BASE_B,
    docA: docARows[0]!.id,
    docB: docBRows[0]!.id,
  };
}

export type ActiveRole = 'student' | 'instructor' | 'mechanic' | 'admin';

export interface JwtIdentity {
  userId: string;
  schoolId: string;
  activeRole: ActiveRole;
}

/**
 * Run a function as the given Supabase-authenticated identity.
 *
 * Each call opens its own postgres-js connection (so connection-level
 * `set role` and `set request.jwt.claims` don't leak between calls),
 * sets the JWT claims GUC, switches to the `authenticated` role, runs
 * the user's callback, and tears the connection down.
 */
export async function asUserOf<T>(
  identity: JwtIdentity,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  const conn = postgres(DIRECT_URL, {
    prepare: false,
    max: 1,
    onnotice: () => {},
  });
  try {
    const claims = JSON.stringify({
      role: 'authenticated',
      sub: identity.userId,
      school_id: identity.schoolId,
      active_role: identity.activeRole,
    });
    // Use set_config so the value is parameterized safely.
    await conn.unsafe(
      `select set_config('request.jwt.claims', $1, false)`,
      [claims],
    );
    await conn.unsafe(`set role authenticated`);
    return await fn(conn);
  } finally {
    try {
      await conn.unsafe(`reset role`);
    } catch {
      /* ignore */
    }
    await conn.end({ timeout: 5 });
  }
}
