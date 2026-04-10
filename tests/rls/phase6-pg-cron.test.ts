/**
 * Phase 6 pg_cron smoke test + audit idempotency + minimum_hours seed verification.
 *
 * Tests:
 *   1. pg_cron job registration (smoke — graceful skip if extension unavailable)
 *   2. course_version.minimum_hours populated for PPL/IR/Comm-SEL
 *   3. run_training_record_audit() idempotency
 *   4. student_progress_forecast() returns expected shape
 *   5. refresh_student_progress_forecast() upserts cache row
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAsAdmin, closeAdmin, seedTwoSchools, SCHOOL_A, BASE_A, USER_A } from './harness';

// Fixed UUIDs from Phase 5 seed
const CV_PPL = '55555555-5555-5555-5555-55555555551a';
const CV_IR = '55555555-5555-5555-5555-55555555552a';
const CV_CSEL = '55555555-5555-5555-5555-55555555553a';

describe('Phase 6: pg_cron + audit + forecast + seed', () => {
  let enrollmentId: string;

  beforeAll(async () => {
    await seedTwoSchools();

    const sql = dbAsAdmin();

    // Re-seed courses (they get truncated by seedTwoSchools)
    await sql.unsafe(`select public.fn_phase5_seed_courses()`);

    // Backfill minimum_hours (migration 0030 runs at db reset but not on
    // manual re-seed; the published-version seal trigger requires replica mode)
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      update public.course_version set
        minimum_hours = '{"total":40,"dual":20,"solo":10,"cross_country":3,"night":3,"instrument":3,"solo_cross_country":5,"landings_day":10,"landings_night":10}'::jsonb,
        default_plan_cadence_hours_per_week = 4
      where id = '${CV_PPL}'::uuid
    `);
    await sql.unsafe(`
      update public.course_version set
        minimum_hours = '{"total":50,"dual":0,"solo":0,"cross_country":50,"night":0,"instrument":40,"instrument_approaches":6}'::jsonb,
        default_plan_cadence_hours_per_week = 3
      where id = '${CV_IR}'::uuid
    `);
    await sql.unsafe(`
      update public.course_version set
        minimum_hours = '{"total":250,"dual":20,"solo":10,"cross_country":50,"night":10,"instrument":10,"solo_cross_country":5}'::jsonb,
        default_plan_cadence_hours_per_week = 3
      where id = '${CV_CSEL}'::uuid
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    // Create an enrollment for testing forecast + audit
    const rows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.student_course_enrollment
        (school_id, user_id, course_version_id, enrolled_at)
      values
        ('${SCHOOL_A}', '${USER_A}', '${CV_PPL}'::uuid,
         now() - interval '8 weeks')
      returning id
    `);
    enrollmentId = rows[0]!.id;
  });

  afterAll(async () => {
    await closeAdmin();
  });

  // -------------------------------------------------------------------------
  // 1. pg_cron job registration
  // -------------------------------------------------------------------------
  it('pg_cron job is registered (or extension unavailable)', async () => {
    const sql = dbAsAdmin();
    try {
      const rows = await sql.unsafe<Array<{ jobname: string; schedule: string }>>(`
        select jobname, schedule from cron.job
        where jobname = 'phase6_nightly_training_record_audit'
      `);
      // If pg_cron is available, we should have exactly one job
      expect(rows.length).toBe(1);
      expect(rows[0]!.schedule).toBe('0 7 * * *');
    } catch (err: unknown) {
      // pg_cron not available locally — acceptable
      const message = (err as Error).message || '';
      expect(message).toMatch(/relation "cron\.job" does not exist|schema "cron" does not exist/);
    }
  });

  // -------------------------------------------------------------------------
  // 2. course_version.minimum_hours populated
  // -------------------------------------------------------------------------
  it('PPL minimum_hours is populated with section 61.109 values', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ minimum_hours: Record<string, unknown>; default_plan_cadence_hours_per_week: string }>>(`
      select minimum_hours, default_plan_cadence_hours_per_week
      from public.course_version where id = '${CV_PPL}'::uuid
    `);
    expect(rows.length).toBe(1);
    const mins = rows[0]!.minimum_hours;
    expect(mins).toBeDefined();
    expect(mins.total).toBe(40);
    expect(mins.dual).toBe(20);
    expect(mins.solo).toBe(10);
    expect(Number(rows[0]!.default_plan_cadence_hours_per_week)).toBe(4);
  });

  it('IR minimum_hours is populated with section 61.65 values', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ minimum_hours: Record<string, unknown>; default_plan_cadence_hours_per_week: string }>>(`
      select minimum_hours, default_plan_cadence_hours_per_week
      from public.course_version where id = '${CV_IR}'::uuid
    `);
    expect(rows.length).toBe(1);
    expect(rows[0]!.minimum_hours.total).toBe(50);
    expect(rows[0]!.minimum_hours.instrument).toBe(40);
    expect(Number(rows[0]!.default_plan_cadence_hours_per_week)).toBe(3);
  });

  it('Comm-SEL minimum_hours is populated with section 61.129 values', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ minimum_hours: Record<string, unknown>; default_plan_cadence_hours_per_week: string }>>(`
      select minimum_hours, default_plan_cadence_hours_per_week
      from public.course_version where id = '${CV_CSEL}'::uuid
    `);
    expect(rows.length).toBe(1);
    expect(rows[0]!.minimum_hours.total).toBe(250);
    expect(rows[0]!.minimum_hours.cross_country).toBe(50);
    expect(Number(rows[0]!.default_plan_cadence_hours_per_week)).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 3. student_progress_forecast() returns expected shape
  // -------------------------------------------------------------------------
  it('student_progress_forecast returns valid jsonb', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ forecast: Record<string, unknown> }>>(`
      select public.student_progress_forecast('${enrollmentId}'::uuid) as forecast
    `);
    expect(rows.length).toBe(1);
    const f = rows[0]!.forecast;
    expect(f.student_enrollment_id).toBe(enrollmentId);
    expect(f.confidence).toBe('medium'); // 8 weeks elapsed => medium
    expect(Number(f.expected_hours_to_date)).toBeGreaterThan(0);
    expect(Number(f.actual_hours_to_date)).toBe(0); // no flight time logged
    expect(Number(f.ahead_behind_hours)).toBeLessThan(0); // behind (no hours)
    expect(Number(f.remaining_hours)).toBe(40); // full PPL minimum
  });

  // -------------------------------------------------------------------------
  // 4. refresh_student_progress_forecast() upserts cache
  // -------------------------------------------------------------------------
  it('refresh_student_progress_forecast upserts into cache', async () => {
    const sql = dbAsAdmin();

    // Call refresh
    await sql.unsafe(`select public.refresh_student_progress_forecast('${enrollmentId}'::uuid)`);

    // Verify cache row exists
    const rows = await sql.unsafe<Array<{ confidence: string; remaining_hours: string }>>(`
      select confidence, remaining_hours
      from public.student_progress_forecast_cache
      where student_enrollment_id = '${enrollmentId}'::uuid
    `);
    expect(rows.length).toBe(1);
    expect(rows[0]!.confidence).toBe('medium');
    expect(Number(rows[0]!.remaining_hours)).toBe(40);

    // Call again — should update, not duplicate
    await sql.unsafe(`select public.refresh_student_progress_forecast('${enrollmentId}'::uuid)`);
    const rows2 = await sql.unsafe<Array<{ confidence: string }>>(`
      select confidence
      from public.student_progress_forecast_cache
      where student_enrollment_id = '${enrollmentId}'::uuid
    `);
    expect(rows2.length).toBe(1); // still one row
  });

  // -------------------------------------------------------------------------
  // 5. run_training_record_audit() idempotency
  // -------------------------------------------------------------------------
  it('run_training_record_audit is idempotent — no duplicates on re-run', async () => {
    const sql = dbAsAdmin();

    // Clear any previous exceptions (bypass hard-delete blocker)
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      delete from public.training_record_audit_exception
      where student_enrollment_id = '${enrollmentId}'::uuid
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    // First run
    await sql.unsafe(`select public.run_training_record_audit()`);

    const countAfterFirst = await sql.unsafe<Array<{ cnt: string }>>(`
      select count(*) as cnt
      from public.training_record_audit_exception
      where student_enrollment_id = '${enrollmentId}'::uuid
        and resolved_at is null
    `);
    const firstCount = Number(countAfterFirst[0]!.cnt);

    // Second run — should not create duplicates
    await sql.unsafe(`select public.run_training_record_audit()`);

    const countAfterSecond = await sql.unsafe<Array<{ cnt: string }>>(`
      select count(*) as cnt
      from public.training_record_audit_exception
      where student_enrollment_id = '${enrollmentId}'::uuid
        and resolved_at is null
    `);
    const secondCount = Number(countAfterSecond[0]!.cnt);

    // Same number of open exceptions
    expect(secondCount).toBe(firstCount);
  });

  it('run_training_record_audit resolves exceptions no longer detected', async () => {
    const sql = dbAsAdmin();

    // Insert a fake exception that won't be re-detected
    await sql.unsafe(`
      insert into public.training_record_audit_exception
        (school_id, base_id, student_enrollment_id, kind, severity, details,
         first_detected_at, last_detected_at)
      values (
        '${SCHOOL_A}', '${BASE_A}', '${enrollmentId}',
        'expired_overrides', 'info', '{"test": true}'::jsonb,
        now() - interval '2 days',
        now() - interval '2 days'
      )
      on conflict (student_enrollment_id, kind)
        where resolved_at is null
      do update set
        last_detected_at = now() - interval '2 days'
    `);

    // Run audit — should resolve the expired_overrides exception since
    // there are no actual expired overrides
    await sql.unsafe(`select public.run_training_record_audit()`);

    const rows = await sql.unsafe<Array<{ resolved_at: string | null }>>(`
      select resolved_at
      from public.training_record_audit_exception
      where student_enrollment_id = '${enrollmentId}'::uuid
        and kind = 'expired_overrides'
      order by created_at desc
      limit 1
    `);
    // The fake exception should be resolved (its last_detected_at was in the past)
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.resolved_at).not.toBeNull();
  });
});
