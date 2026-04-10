/**
 * Phase 6 Plan 01 Task 2b — SQL rules engine function tests.
 *
 * Exercises:
 *   - is_passing_grade parity with TS helper
 *   - check_lesson_prerequisites (passing + failing)
 *   - evaluate_lesson_eligibility with all checks passing, failing, and override
 *   - compute_rollover_line_items (failing + later pass suppression)
 *   - Override race: two concurrent SELECT FOR UPDATE + UPDATE consumed_at
 */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  SCHOOL_A,
  USER_A,
  BASE_A,
  type SeedResult,
} from './harness';

const DIRECT_URL =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:54322/postgres';

let seed: SeedResult;

// Shared fixture IDs populated in beforeAll
let courseId: string;
let courseVersionId: string;
let stageId: string;
let lessonAId: string;  // prerequisite lesson
let lessonBId: string;  // main lesson (depends on A)
let lineItemA1: string; // required line item on lesson A
let lineItemB1: string; // required line item on lesson B
let lineItemB2: string; // must_pass line item on lesson B
let enrollmentId: string;
let instructorId: string;
let aircraftId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Create an instructor user
  instructorId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone)
    values ('${instructorId}', '${SCHOOL_A}', 'cfi@alpha.test', 'Alpha CFI', 'America/Chicago')
    on conflict (id) do nothing
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default)
    values ('${instructorId}', 'instructor', 'none', true)
    on conflict do nothing
  `);

  // Create an aircraft with equipment
  const ac = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number, make, model, year)
    values ('${SCHOOL_A}', '${BASE_A}', 'N-P6FN', 'Cessna', '172', 1998)
    returning id
  `);
  aircraftId = ac[0]!.id;
  await sql.unsafe(`
    insert into public.aircraft_equipment (aircraft_id, tag)
    values ('${aircraftId}', 'ifr_equipped')
  `);

  // Course tree: course -> version -> stage -> lesson A, lesson B
  const c = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought)
    values ('${SCHOOL_A}', 'PPL-TEST', 'Private Pilot Test', 'private_pilot')
    returning id
  `);
  courseId = c[0]!.id;

  const cv = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course_version (course_id, school_id, version_label, grading_scale, min_levels)
    values ('${courseId}', '${SCHOOL_A}', 'v1', 'absolute_ipm', 3)
    returning id
  `);
  courseVersionId = cv[0]!.id;

  const st = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.stage (school_id, course_version_id, position, code, title)
    values ('${SCHOOL_A}', '${courseVersionId}', 1, 'S1', 'Stage 1')
    returning id
  `);
  stageId = st[0]!.id;

  // Lesson A: no prerequisites, position 1
  const lA = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson
      (school_id, course_version_id, stage_id, position, code, title, kind)
    values
      ('${SCHOOL_A}', '${courseVersionId}', '${stageId}', 1, 'L1', 'Intro Flight', 'flight')
    returning id
  `);
  lessonAId = lA[0]!.id;

  // Line item on lesson A (required)
  const liA1 = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.line_item
      (school_id, course_version_id, lesson_id, position, code, title, classification)
    values
      ('${SCHOOL_A}', '${courseVersionId}', '${lessonAId}', 1, 'LI-A1', 'Straight and Level', 'required')
    returning id
  `);
  lineItemA1 = liA1[0]!.id;

  // Lesson B: prerequisite on lesson A, position 2, max_repeats = 3
  const lB = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson
      (school_id, course_version_id, stage_id, position, code, title, kind,
       prerequisite_lesson_ids, max_repeats)
    values
      ('${SCHOOL_A}', '${courseVersionId}', '${stageId}', 2, 'L2', 'Stalls', 'flight',
       array['${lessonAId}']::uuid[], 3)
    returning id
  `);
  lessonBId = lB[0]!.id;

  // Line items on lesson B
  const liB1 = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.line_item
      (school_id, course_version_id, lesson_id, position, code, title, classification)
    values
      ('${SCHOOL_A}', '${courseVersionId}', '${lessonBId}', 1, 'LI-B1', 'Power Off Stall', 'required')
    returning id
  `);
  lineItemB1 = liB1[0]!.id;

  const liB2 = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.line_item
      (school_id, course_version_id, lesson_id, position, code, title, classification)
    values
      ('${SCHOOL_A}', '${courseVersionId}', '${lessonBId}', 2, 'LI-B2', 'Power On Stall', 'must_pass')
    returning id
  `);
  lineItemB2 = liB2[0]!.id;

  // Enrollment
  const enr = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.student_course_enrollment
      (school_id, user_id, course_version_id)
    values
      ('${SCHOOL_A}', '${USER_A}', '${courseVersionId}')
    returning id
  `);
  enrollmentId = enr[0]!.id;

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

// ---------------------------------------------------------------------------
// is_passing_grade SQL ↔ TS parity
// ---------------------------------------------------------------------------
describe('is_passing_grade()', () => {
  it('absolute_ipm: I and P fail, PM and M pass', async () => {
    const sql = dbAsAdmin();
    type BoolRow = { result: boolean };
    for (const [val, expected] of [
      ['I', false],
      ['P', false],
      ['PM', true],
      ['M', true],
    ] as const) {
      const r = await sql.unsafe<BoolRow[]>(
        `select public.is_passing_grade('absolute_ipm', '${val}') as result`,
      );
      expect(r[0]!.result).toBe(expected);
    }
  });

  it('relative_5: 1-2 fail, 3-5 pass', async () => {
    const sql = dbAsAdmin();
    type BoolRow = { result: boolean };
    for (const [val, expected] of [
      ['1', false],
      ['2', false],
      ['3', true],
      ['4', true],
      ['5', true],
    ] as const) {
      const r = await sql.unsafe<BoolRow[]>(
        `select public.is_passing_grade('relative_5', '${val}') as result`,
      );
      expect(r[0]!.result).toBe(expected);
    }
  });

  it('pass_fail: pass passes, fail fails', async () => {
    const sql = dbAsAdmin();
    type BoolRow = { result: boolean };
    const pass = await sql.unsafe<BoolRow[]>(
      `select public.is_passing_grade('pass_fail', 'pass') as result`,
    );
    expect(pass[0]!.result).toBe(true);
    const fail = await sql.unsafe<BoolRow[]>(
      `select public.is_passing_grade('pass_fail', 'fail') as result`,
    );
    expect(fail[0]!.result).toBe(false);
  });

  it('null/empty returns false', async () => {
    const sql = dbAsAdmin();
    type BoolRow = { result: boolean };
    const r1 = await sql.unsafe<BoolRow[]>(
      `select public.is_passing_grade('absolute_ipm', null) as result`,
    );
    expect(r1[0]!.result).toBe(false);
    const r2 = await sql.unsafe<BoolRow[]>(
      `select public.is_passing_grade('absolute_ipm', '') as result`,
    );
    expect(r2[0]!.result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// check_lesson_prerequisites
// ---------------------------------------------------------------------------
describe('check_lesson_prerequisites()', () => {
  it('returns ok:true when prerequisite has a satisfactory sealed grade sheet', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);

    // Create a sealed grade sheet for lesson A with a passing line item grade
    const gs = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.lesson_grade_sheet
        (school_id, base_id, student_enrollment_id, lesson_id, status, sealed_at)
      values
        ('${SCHOOL_A}', '${BASE_A}', '${enrollmentId}', '${lessonAId}', 'sealed', now())
      returning id
    `);
    await sql.unsafe(`
      insert into public.line_item_grade (grade_sheet_id, line_item_id, grade_value, position)
      values ('${gs[0]!.id}', '${lineItemA1}', 'PM', 1)
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    type JsonbRow = { result: string };
    const r = await sql.unsafe<JsonbRow[]>(
      `select public.check_lesson_prerequisites('${enrollmentId}', '${lessonBId}')::text as result`,
    );
    const parsed = JSON.parse(r[0]!.result);
    expect(parsed.ok).toBe(true);
    expect(parsed.missing_lessons).toEqual([]);
  });

  it('returns ok:false with missing lesson when prerequisite not satisfied', async () => {
    const sql = dbAsAdmin();

    // Create a new enrollment (no grade sheets at all)
    await sql.unsafe(`set session_replication_role = replica`);
    const enr2 = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.student_course_enrollment
        (school_id, user_id, course_version_id)
      values
        ('${SCHOOL_A}', '${USER_A}', '${courseVersionId}')
      returning id
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    type JsonbRow = { result: string };
    const r = await sql.unsafe<JsonbRow[]>(
      `select public.check_lesson_prerequisites('${enr2[0]!.id}', '${lessonBId}')::text as result`,
    );
    const parsed = JSON.parse(r[0]!.result);
    expect(parsed.ok).toBe(false);
    expect(parsed.missing_lessons).toContain(lessonAId);
  });
});

// ---------------------------------------------------------------------------
// evaluate_lesson_eligibility
// ---------------------------------------------------------------------------
describe('evaluate_lesson_eligibility()', () => {
  it('returns ok:true when all checks pass', async () => {
    const sql = dbAsAdmin();
    // enrollmentId already has a passing grade for lesson A (prereq satisfied)
    type JsonbRow = { result: string };
    const r = await sql.unsafe<JsonbRow[]>(
      `select public.evaluate_lesson_eligibility(
        '${enrollmentId}', '${lessonBId}', '${aircraftId}', '${instructorId}'
      )::text as result`,
    );
    const parsed = JSON.parse(r[0]!.result);
    expect(parsed.ok).toBe(true);
    expect(parsed.blockers).toHaveLength(0);
    expect(parsed.override_active).toBe(false);
  });

  it('returns ok:false with prerequisites blocker when prereq not met', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);
    const enr3 = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.student_course_enrollment
        (school_id, user_id, course_version_id)
      values
        ('${SCHOOL_A}', '${USER_A}', '${courseVersionId}')
      returning id
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    type JsonbRow = { result: string };
    const r = await sql.unsafe<JsonbRow[]>(
      `select public.evaluate_lesson_eligibility(
        '${enr3[0]!.id}', '${lessonBId}', '${aircraftId}', '${instructorId}'
      )::text as result`,
    );
    const parsed = JSON.parse(r[0]!.result);
    expect(parsed.ok).toBe(false);
    expect(parsed.blockers.length).toBeGreaterThan(0);
    expect(parsed.blockers[0].kind).toBe('prerequisites');
  });

  it('returns ok:true + override_active:true when active override exists', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);
    const enr4 = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.student_course_enrollment
        (school_id, user_id, course_version_id)
      values
        ('${SCHOOL_A}', '${USER_A}', '${courseVersionId}')
      returning id
    `);
    // No prerequisite grade sheet — but we have an override
    await sql.unsafe(`
      insert into public.lesson_override
        (school_id, base_id, student_enrollment_id, lesson_id, kind, justification,
         granted_by_user_id, signer_snapshot, expires_at)
      values
        ('${SCHOOL_A}', '${BASE_A}', '${enr4[0]!.id}', '${lessonBId}', 'prerequisite_skip',
         'Student demonstrated proficiency in ground school assessment override',
         '${USER_A}', '{"full_name":"Alpha Admin","cert_type":"admin"}'::jsonb,
         now() + interval '30 days')
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    type JsonbRow = { result: string };
    const r = await sql.unsafe<JsonbRow[]>(
      `select public.evaluate_lesson_eligibility(
        '${enr4[0]!.id}', '${lessonBId}', '${aircraftId}', '${instructorId}'
      )::text as result`,
    );
    const parsed = JSON.parse(r[0]!.result);
    expect(parsed.ok).toBe(true);
    expect(parsed.override_active).toBe(true);
    expect(parsed.override_id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// compute_rollover_line_items
// ---------------------------------------------------------------------------
describe('compute_rollover_line_items()', () => {
  it('failing must_pass item returns the row; later passing clears it', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);

    // New enrollment for rollover test
    const enr5 = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.student_course_enrollment
        (school_id, user_id, course_version_id)
      values
        ('${SCHOOL_A}', '${USER_A}', '${courseVersionId}')
      returning id
    `);
    const eid = enr5[0]!.id;

    // Sealed grade sheet 1: lesson B, line item B2 fails (grade 'I')
    const gs1 = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.lesson_grade_sheet
        (school_id, base_id, student_enrollment_id, lesson_id, status, sealed_at)
      values
        ('${SCHOOL_A}', '${BASE_A}', '${eid}', '${lessonBId}', 'sealed',
         now() - interval '2 days')
      returning id
    `);
    await sql.unsafe(`
      insert into public.line_item_grade (grade_sheet_id, line_item_id, grade_value, position)
      values ('${gs1[0]!.id}', '${lineItemB2}', 'I', 1)
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    // Verify: failing item shows up in rollover
    type RollRow = { source_grade_sheet_id: string; line_item_id: string };
    let r = await sql.unsafe<RollRow[]>(
      `select * from public.compute_rollover_line_items('${eid}', '${lessonBId}')`,
    );
    expect(r.length).toBe(1);
    expect(r[0]!.line_item_id).toBe(lineItemB2);

    // Now seal a second grade sheet where B2 passes
    await sql.unsafe(`set session_replication_role = replica`);
    const gs2 = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.lesson_grade_sheet
        (school_id, base_id, student_enrollment_id, lesson_id, status, sealed_at)
      values
        ('${SCHOOL_A}', '${BASE_A}', '${eid}', '${lessonBId}', 'sealed',
         now() - interval '1 day')
      returning id
    `);
    await sql.unsafe(`
      insert into public.line_item_grade (grade_sheet_id, line_item_id, grade_value, position)
      values ('${gs2[0]!.id}', '${lineItemB2}', 'PM', 1)
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    // Now rollover should be empty (later pass suppresses the failure)
    r = await sql.unsafe<RollRow[]>(
      `select * from public.compute_rollover_line_items('${eid}', '${lessonBId}')`,
    );
    expect(r.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// check_lesson_repeat_limit
// ---------------------------------------------------------------------------
describe('check_lesson_repeat_limit()', () => {
  it('returns ok:false when sealed count equals max_repeats', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);

    const enr6 = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.student_course_enrollment
        (school_id, user_id, course_version_id)
      values ('${SCHOOL_A}', '${USER_A}', '${courseVersionId}')
      returning id
    `);
    const eid = enr6[0]!.id;

    // Lesson B has max_repeats = 3. Seal 3 grade sheets.
    for (let i = 0; i < 3; i++) {
      await sql.unsafe(`
        insert into public.lesson_grade_sheet
          (school_id, base_id, student_enrollment_id, lesson_id, status, sealed_at)
        values
          ('${SCHOOL_A}', '${BASE_A}', '${eid}', '${lessonBId}', 'sealed',
           now() - interval '${3 - i} days')
      `);
    }
    await sql.unsafe(`set session_replication_role = origin`);

    type JsonbRow = { result: string };
    const r = await sql.unsafe<JsonbRow[]>(
      `select public.check_lesson_repeat_limit('${eid}', '${lessonBId}')::text as result`,
    );
    const parsed = JSON.parse(r[0]!.result);
    expect(parsed.ok).toBe(false);
    expect(parsed.exceeded).toBe(true);
    expect(parsed.current_count).toBe(3);
    expect(parsed.max).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Override race: concurrent consumption
// ---------------------------------------------------------------------------
describe('override consumption race', () => {
  it('two parallel transactions consuming the same override: exactly one wins', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);

    // Fresh enrollment with an active override
    const enrRace = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.student_course_enrollment
        (school_id, user_id, course_version_id)
      values ('${SCHOOL_A}', '${USER_A}', '${courseVersionId}')
      returning id
    `);
    const raceEnrollmentId = enrRace[0]!.id;

    const ov = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.lesson_override
        (school_id, base_id, student_enrollment_id, lesson_id, kind, justification,
         granted_by_user_id, signer_snapshot, expires_at)
      values
        ('${SCHOOL_A}', '${BASE_A}', '${raceEnrollmentId}', '${lessonBId}', 'prerequisite_skip',
         'Racing concurrent consume test override justification text',
         '${USER_A}', '{"full_name":"Alpha Admin","cert_type":"admin"}'::jsonb,
         now() + interval '30 days')
      returning id
    `);
    const overrideId = ov[0]!.id;
    await sql.unsafe(`set session_replication_role = origin`);

    // Two parallel clients each try SELECT FOR UPDATE + UPDATE consumed_at
    const clientA = postgres(DIRECT_URL, { prepare: false, max: 1, onnotice: () => {} });
    const clientB = postgres(DIRECT_URL, { prepare: false, max: 1, onnotice: () => {} });

    try {
      const consume = async (client: postgres.Sql): Promise<boolean> => {
        return client.begin(async (tx) => {
          const rows = await tx.unsafe<Array<{ id: string; consumed_at: string | null }>>(`
            select id, consumed_at from public.lesson_override
            where id = '${overrideId}'
            for update
          `);
          if (!rows[0] || rows[0].consumed_at !== null) {
            return false; // Already consumed by the other tx
          }
          await tx.unsafe(`
            update public.lesson_override
            set consumed_at = now()
            where id = '${overrideId}'
          `);
          return true;
        });
      };

      const results = await Promise.allSettled([
        consume(clientA),
        consume(clientB),
      ]);

      // Count successes (true = consumed, false = saw consumed_at already set)
      const winners = results.filter(
        (r) => r.status === 'fulfilled' && r.value === true,
      );
      const losers = results.filter(
        (r) => r.status === 'fulfilled' && r.value === false,
      );
      const errors = results.filter((r) => r.status === 'rejected');

      // Exactly one winner. The loser either got false or hit a serialization error.
      expect(winners.length + errors.length + losers.length).toBe(2);
      expect(winners.length).toBe(1);
    } finally {
      await clientA.end({ timeout: 5 });
      await clientB.end({ timeout: 5 });
    }

    // Verify override is consumed exactly once
    const finalRow = await sql.unsafe<Array<{ consumed_at: string | null }>>(
      `select consumed_at from public.lesson_override where id = '${overrideId}'`,
    );
    expect(finalRow[0]!.consumed_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// suggest_next_activity
// ---------------------------------------------------------------------------
describe('suggest_next_activity()', () => {
  it('returns first incomplete lesson in course order', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);

    // Fresh enrollment, no grades at all
    const enr7 = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.student_course_enrollment
        (school_id, user_id, course_version_id)
      values ('${SCHOOL_A}', '${USER_A}', '${courseVersionId}')
      returning id
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    type JsonbRow = { result: string };
    const r = await sql.unsafe<JsonbRow[]>(
      `select public.suggest_next_activity('${enr7[0]!.id}')::text as result`,
    );
    const parsed = JSON.parse(r[0]!.result);
    expect(parsed.lesson_id).toBe(lessonAId); // First lesson in sequence
    expect(parsed.kind).toBe('sequence');
  });
});
