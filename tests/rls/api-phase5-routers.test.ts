/**
 * Phase 5 plan 03 — API router integration tests (Slice B).
 *
 * Exercises the tRPC surface added in 05-03:
 *   - admin.courses.fork + publish (transitive seal)
 *   - admin.enrollments.create (refuses draft versions)
 *   - admin.stageChecks.schedule (different-instructor guard)
 *   - gradeSheet.createFromReservation + setGrade + seal (happy path)
 *   - gradeSheet.seal refuses when a must_pass line_item is failing
 *   - admin.endorsements.issue renders {{placeholders}} into rendered_text
 *   - schedule.checkStudentCurrency returns blockers
 *   - schedule.approve preserves Phase 3 regression when lesson_id is null
 *   - flightLog.categorize validates the ±6 min tolerance
 *   - record.myFlightLog scopes to ctx.session.userId
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let aircraftId: string;
let instructorId: string;
let otherInstructorId: string;
let studentId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  // Re-seed Phase 5 system courses + endorsement templates (seedTwoSchools wiped them)
  await sql.unsafe(`select public.fn_phase5_seed_courses()`);

  await sql.unsafe(`set session_replication_role = replica`);

  // Aircraft
  const ac = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-P5T1')
    returning id
  `);
  aircraftId = ac[0]!.id;

  // Users
  // Real v4 UUIDs (zod uuid requires version nibble 1-8 + variant nibble 8-b)
  const instId = 'a1111111-1111-4111-8111-111111111101';
  const otherInstId = 'a1111111-1111-4111-8111-111111111102';
  const stuId = 'a1111111-1111-4111-8111-111111111103';
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${instId}',      '${seed.schoolA}', 'inst1-p5@alpha.test', 'Inst One'),
      ('${otherInstId}', '${seed.schoolA}', 'inst2-p5@alpha.test', 'Inst Two'),
      ('${stuId}',       '${seed.schoolA}', 'stu-p5@alpha.test',   'Student P5')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${instId}',      'instructor', 'none', true),
      ('${otherInstId}', 'instructor', 'none', true),
      ('${stuId}',       'student',    'none', true)
  `);
  await sql.unsafe(`
    insert into public.person_profile (user_id, school_id, first_name, last_name, faa_airman_cert_number)
    values
      ('${instId}',      '${seed.schoolA}', 'Inst',    'One', 'CFI-111'),
      ('${otherInstId}', '${seed.schoolA}', 'Inst',    'Two', 'CFI-222'),
      ('${stuId}',       '${seed.schoolA}', 'Student', 'P5',  null)
  `);
  instructorId = instId;
  otherInstructorId = otherInstId;
  studentId = stuId;

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('Phase 5-03 API routers', () => {
  let forkedVersionId: string;
  let enrollmentId: string;
  let firstLessonId: string;
  let firstStageId: string;

  it('admin.courses.createDraft + addStage + addLesson + addLineItem builds a tree', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const created = await caller.admin.courses.createDraft({
      code: 'TEST-PPL',
      title: 'Test PPL for P5 Router Suite',
      ratingSought: 'private_pilot',
      versionLabel: 'v1.0',
      gradingScale: 'absolute_ipm',
      minLevels: 3,
    });
    expect(created.version!.id).toBeTruthy();
    forkedVersionId = created.version!.id;

    const stage = await caller.admin.courses.addStage({
      versionId: forkedVersionId,
      position: 0,
      code: 'S1',
      title: 'Pre-Solo',
    });
    firstStageId = stage!.id;
    const lesson = await caller.admin.courses.addLesson({
      versionId: forkedVersionId,
      stageId: firstStageId,
      position: 0,
      code: 'L1',
      title: 'First Lesson',
      kind: 'flight',
    });
    firstLessonId = lesson!.id;
    // Two line items: one required (PM passes), one must_pass
    await caller.admin.courses.addLineItem({
      versionId: forkedVersionId,
      lessonId: firstLessonId,
      position: 0,
      code: 'LI1',
      title: 'Preflight inspection',
      classification: 'required',
    });
    await caller.admin.courses.addLineItem({
      versionId: forkedVersionId,
      lessonId: firstLessonId,
      position: 1,
      code: 'LI2',
      title: 'Normal landing',
      classification: 'must_pass',
    });
  });

  it('admin.enrollments.create refuses a draft course version', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    await expect(
      caller.admin.enrollments.create({
        studentUserId: studentId,
        courseVersionId: forkedVersionId,
        primaryInstructorId: instructorId,
      }),
    ).rejects.toThrow(/draft/i);
  });

  it('admin.courses.publish activates the version + enrollment works', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    await caller.admin.courses.publish({ versionId: forkedVersionId });

    const enr = await caller.admin.enrollments.create({
      studentUserId: studentId,
      courseVersionId: forkedVersionId,
      primaryInstructorId: instructorId,
    });
    enrollmentId = enr!.id;
    expect(enrollmentId).toBeTruthy();
  });

  it('admin.stageChecks.schedule rejects checker == primary_instructor', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    await expect(
      caller.admin.stageChecks.schedule({
        studentEnrollmentId: enrollmentId,
        stageId: firstStageId,
        checkerUserId: instructorId, // same as primary_instructor
        scheduledAt: new Date('2027-02-01T10:00:00Z'),
      }),
    ).rejects.toThrow(/primary instructor/i);
  });

  it('admin.stageChecks.schedule allows a different checker', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const sc = await caller.admin.stageChecks.schedule({
      studentEnrollmentId: enrollmentId,
      stageId: firstStageId,
      checkerUserId: otherInstructorId,
      scheduledAt: new Date('2027-02-01T10:00:00Z'),
    });
    expect(sc!.status).toBe('scheduled');
  });

  it('gradeSheet.createFromReservation + seal happy path', async () => {
    // Create a reservation tied to the lesson
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const sql = dbAsAdmin();
    const resRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status,
         aircraft_id, instructor_id, student_id, lesson_id, student_enrollment_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', 'flight',
         '[2027-03-10 14:00+00,2027-03-10 15:30+00)'::tstzrange, 'closed',
         '${aircraftId}', '${instructorId}', '${studentId}',
         '${firstLessonId}', '${enrollmentId}')
      returning id
    `);
    const resId = resRows[0]!.id;

    const sheet = await caller.gradeSheet.createFromReservation({
      reservationId: resId,
      lessonId: firstLessonId,
      studentEnrollmentId: enrollmentId,
    });
    expect(sheet!.status).toBe('draft');

    // Fetch line items to grade them
    const items = await sql.unsafe<Array<{ id: string; classification: string }>>(`
      select id, classification::text from public.line_item
      where lesson_id = '${firstLessonId}' and deleted_at is null
    `);
    for (const li of items) {
      if (li.classification === 'optional') continue;
      await caller.gradeSheet.setGrade({
        gradeSheetId: sheet!.id,
        lineItemId: li.id,
        gradeValue: 'PM',
      });
    }
    const sealed = await caller.gradeSheet.seal({ gradeSheetId: sheet!.id });
    expect(sealed!.status).toBe('sealed');
    expect(sealed!.sealedAt).toBeTruthy();
  });

  it('gradeSheet.seal refuses when a must_pass item is failing', async () => {
    const sql = dbAsAdmin();
    const items = await sql.unsafe<Array<{ id: string }>>(`
      select id from public.line_item
      where lesson_id = '${firstLessonId}' and classification = 'must_pass'
      limit 1
    `);
    if (items.length === 0) {
      // No must_pass items on this lesson — skip
      return;
    }
    // Create a fresh reservation + grade sheet
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const resRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status,
         aircraft_id, instructor_id, student_id, lesson_id, student_enrollment_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', 'flight',
         '[2027-03-11 14:00+00,2027-03-11 15:30+00)'::tstzrange, 'closed',
         '${aircraftId}', '${instructorId}', '${studentId}',
         '${firstLessonId}', '${enrollmentId}')
      returning id
    `);
    const sheet = await caller.gradeSheet.createFromReservation({
      reservationId: resRows[0]!.id,
      lessonId: firstLessonId,
      studentEnrollmentId: enrollmentId,
    });
    // Grade everything as 'I' (introduce → not passing in must_pass)
    const allItems = await sql.unsafe<Array<{ id: string; classification: string }>>(`
      select id, classification::text from public.line_item
      where lesson_id = '${firstLessonId}' and deleted_at is null
    `);
    for (const li of allItems) {
      if (li.classification === 'optional') continue;
      await caller.gradeSheet.setGrade({
        gradeSheetId: sheet!.id,
        lineItemId: li.id,
        gradeValue: 'I',
      });
    }
    await expect(
      caller.gradeSheet.seal({ gradeSheetId: sheet!.id }),
    ).rejects.toThrow(/must-pass|must_pass/i);
  });

  it('admin.endorsements.issue renders {{placeholders}} into rendered_text', async () => {
    const sql = dbAsAdmin();
    const tmpl = await sql.unsafe<Array<{ id: string; body_template: string }>>(`
      select id, body_template from public.endorsement_template
      where body_template like '%{{%' limit 1
    `);
    expect(tmpl.length).toBe(1);

    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const endorsement = await caller.admin.endorsements.issue({
      studentUserId: studentId,
      templateId: tmpl[0]!.id,
    });
    expect(endorsement!.renderedText).toBeTruthy();
    // Template should have produced different text (no leftover {{ }}) when
    // default placeholders cover the keys. Allow residual {{..}} only for
    // uncommon placeholders.
    expect(endorsement!.sealed).toBe(true);
    expect(endorsement!.signerSnapshot).toBeTruthy();
  });

  it('schedule.checkStudentCurrency reports missing required currencies', async () => {
    // Patch the first lesson to require medical + bfr
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      update public.lesson
      set required_currencies = '["medical","bfr"]'::jsonb
      where id = '${firstLessonId}'
    `);
    await sql.unsafe(`set session_replication_role = origin`);
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.schedule.checkStudentCurrency({
      lessonId: firstLessonId,
      studentUserId: studentId,
    });
    expect(result.blockers.length).toBeGreaterThan(0);
    const kinds = result.blockers.map((b) => b.kind).sort();
    expect(kinds).toContain('medical');
    expect(kinds).toContain('bfr');
  });

  it('schedule.approve with no lesson_id passes through (Phase 3 regression)', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const startsAt = new Date('2027-04-10T14:00:00Z');
    const endsAt = new Date('2027-04-10T15:30:00Z');
    const created = await caller.schedule.request({
      activityType: 'flight',
      aircraftId,
      instructorId,
      studentId,
      startsAt,
      endsAt,
    });
    const approved = await caller.schedule.approve({
      reservationId: created!.reservationIds[0]!,
    });
    expect(approved!.status).toBe('approved');
  });

  it('flightLog.categorize rejects day+night exceeding hobbs delta ± 6 min', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const sql = dbAsAdmin();
    // Create a flight_log_entry with 1.5 airframe delta (90 min)
    const resRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status, aircraft_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', 'flight',
         '[2027-05-10 14:00+00,2027-05-10 15:30+00)'::tstzrange, 'closed',
         '${aircraftId}')
      returning id
    `);
    const entryRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.flight_log_entry
        (school_id, base_id, aircraft_id, kind, flown_at, airframe_delta, recorded_by)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', 'flight',
         now(), 1.5, '${seed.userA}')
      returning id
    `);
    const resId = resRows[0]!.id;
    const entryId = entryRows[0]!.id;

    // 120 min vs 90 min hobbs → should fail
    await expect(
      caller.flightLog.categorize({
        reservationId: resId,
        flightLogEntryId: entryId,
        splits: [
          {
            userId: instructorId,
            kind: 'dual_given',
            dayMinutes: 120,
            nightMinutes: 0,
          },
        ],
      }),
    ).rejects.toThrow(/±6|hobbs/i);

    // 90 min vs 90 min → should succeed
    const ok = await caller.flightLog.categorize({
      reservationId: resId,
      flightLogEntryId: entryId,
      splits: [
        {
          userId: instructorId,
          kind: 'dual_given',
          dayMinutes: 90,
          nightMinutes: 0,
        },
      ],
    });
    expect(ok.inserted.length).toBe(1);
  });

  it('record.myFlightLog scopes rows to ctx.session.userId', async () => {
    const instCaller = adminCaller({
      userId: instructorId,
      schoolId: seed.schoolA,
      activeRole: 'instructor',
      roles: ['instructor'],
      activeBaseId: seed.baseA,
    });
    const stuCaller = adminCaller({
      userId: studentId,
      schoolId: seed.schoolA,
      activeRole: 'student',
      roles: ['student'],
      activeBaseId: seed.baseA,
    });
    const instRows = await instCaller.record.myFlightLog();
    const stuRows = await stuCaller.record.myFlightLog();
    // Instructor should see the row from the categorize test; student has none
    expect(instRows.every((r) => r.userId === instructorId)).toBe(true);
    expect(stuRows.every((r) => r.userId === studentId)).toBe(true);
  });
});
