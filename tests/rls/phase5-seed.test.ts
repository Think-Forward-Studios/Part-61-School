/**
 * Phase 5 Plan 02 — seed verification.
 *
 * Asserts that after `supabase db reset` (or after re-running
 * `public.fn_phase5_seed_courses()`), the database holds:
 *   - the AC 61-65K endorsement_template catalog (≥20 rows)
 *   - 3 system courses (PPL, IR, CSEL) with school_id=null
 *   - one published course_version per course
 *   - ≥50 lessons and ≥250 line_items across the 3 courses
 *   - clone_course_version forks a tree with the same lesson count
 *
 * Other test files call `seedTwoSchools()` which TRUNCATEs public.schools
 * CASCADE, wiping the seeded courses. To stay independent of execution
 * order, this suite re-runs `fn_phase5_seed_courses()` in beforeAll.
 * endorsement_template has no FK to schools and is never truncated.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAdmin, dbAsAdmin, seedTwoSchools } from './harness';

beforeAll(async () => {
  // Ensure a clean two-school fixture exists (other tests may not have
  // run yet), then restore the Phase 5 course seeds that the TRUNCATE
  // above wiped.
  await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`select public.fn_phase5_seed_courses()`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('Phase 5 Plan 02 — endorsement_template catalog', () => {
  it('has at least 20 AC 61-65K endorsement rows', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ n: number }>>(
      `select count(*)::int as n from public.endorsement_template`,
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(20);
  });

  it('includes the core Appendix A and Appendix B codes', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ code: string }>>(
      `select code from public.endorsement_template order by code`,
    );
    const codes = rows.map((r) => r.code);
    for (const required of [
      'A.1',
      'A.2',
      'A.3',
      'A.5',
      'B.1',
      'B.2',
      'B.8',
      'B.10',
    ]) {
      expect(codes).toContain(required);
    }
  });

  it('every row cites an AC 61-65K reference', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ n: number }>>(
      `select count(*)::int as n from public.endorsement_template
        where ac_reference not like 'AC 61-65K%'`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});

describe('Phase 5 Plan 02 — system courses', () => {
  it('has exactly 3 system courses with school_id=null', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ n: number }>>(
      `select count(*)::int as n from public.course where school_id is null`,
    );
    expect(rows[0]!.n).toBe(3);
  });

  it('covers private_pilot, instrument_rating, and commercial_single_engine', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ rating_sought: string }>>(
      `select rating_sought::text from public.course
        where school_id is null order by rating_sought`,
    );
    const set = new Set(rows.map((r) => r.rating_sought));
    expect(set.has('private_pilot')).toBe(true);
    expect(set.has('instrument_rating')).toBe(true);
    expect(set.has('commercial_single_engine')).toBe(true);
  });

  it('each system course has exactly one published course_version with absolute_ipm grading', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<
      Array<{ course_id: string; n: number; scales: string }>
    >(
      `select cv.course_id::text, count(*)::int as n,
              string_agg(distinct cv.grading_scale::text, ',') as scales
         from public.course_version cv
         join public.course c on c.id = cv.course_id
        where c.school_id is null and cv.published_at is not null
        group by cv.course_id`,
    );
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.n).toBe(1);
      expect(r.scales).toBe('absolute_ipm');
    }
  });

  it('has ≥50 lessons and ≥250 line_items across the 3 system courses', async () => {
    const sql = dbAsAdmin();
    const lessons = await sql.unsafe<Array<{ n: number }>>(
      `select count(*)::int as n
         from public.lesson l
         join public.course_version cv on cv.id = l.course_version_id
         join public.course c on c.id = cv.course_id
        where c.school_id is null`,
    );
    const items = await sql.unsafe<Array<{ n: number }>>(
      `select count(*)::int as n
         from public.line_item li
         join public.course_version cv on cv.id = li.course_version_id
         join public.course c on c.id = cv.course_id
        where c.school_id is null`,
    );
    expect(lessons[0]!.n).toBeGreaterThanOrEqual(50);
    expect(items[0]!.n).toBeGreaterThanOrEqual(250);
  });

  it('PPL has ≥3 stages', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ n: number }>>(
      `select count(*)::int as n
         from public.stage s
         join public.course_version cv on cv.id = s.course_version_id
         join public.course c on c.id = cv.course_id
        where c.code = 'PPL-SE' and c.school_id is null`,
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(3);
  });
});

describe('Phase 5 Plan 02 — clone_course_version round-trip', () => {
  it('forks PPL into a target school with the same lesson and line_item counts', async () => {
    const sql = dbAsAdmin();

    const src = await sql.unsafe<Array<{ id: string }>>(
      `select cv.id
         from public.course_version cv
         join public.course c on c.id = cv.course_id
        where c.code = 'PPL-SE' and c.school_id is null
          and cv.published_at is not null
        limit 1`,
    );
    expect(src.length).toBe(1);
    const sourceId = src[0]!.id;

    const srcCounts = await sql.unsafe<
      Array<{ lessons: number; items: number }>
    >(
      `select
         (select count(*) from public.lesson where course_version_id = '${sourceId}')::int as lessons,
         (select count(*) from public.line_item where course_version_id = '${sourceId}')::int as items`,
    );

    const cloned = await sql.unsafe<Array<{ new_id: string }>>(
      `select public.clone_course_version(
          '${sourceId}'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid
        ) as new_id`,
    );
    const newId = cloned[0]!.new_id;
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(sourceId);

    const newCounts = await sql.unsafe<
      Array<{ lessons: number; items: number; published_at: string | null }>
    >(
      `select
         (select count(*) from public.lesson where course_version_id = '${newId}')::int as lessons,
         (select count(*) from public.line_item where course_version_id = '${newId}')::int as items,
         (select published_at from public.course_version where id = '${newId}') as published_at`,
    );
    expect(newCounts[0]!.lessons).toBe(srcCounts[0]!.lessons);
    expect(newCounts[0]!.items).toBe(srcCounts[0]!.items);
    // Fork creates a draft
    expect(newCounts[0]!.published_at).toBeNull();

    // Soft-delete cleanup — hard delete is forbidden by the
    // syllabus hard-delete blocker triggers. The cloned version is a
    // draft (published_at is null) so UPDATEs on its tree are allowed.
    await sql.unsafe(`
      update public.line_item    set deleted_at = now() where course_version_id = '${newId}';
      update public.lesson       set deleted_at = now() where course_version_id = '${newId}';
      update public.unit         set deleted_at = now() where course_version_id = '${newId}';
      update public.course_phase set deleted_at = now() where course_version_id = '${newId}';
      update public.stage        set deleted_at = now() where course_version_id = '${newId}';
      update public.course_version set deleted_at = now() where id = '${newId}';
    `);
  });
});
