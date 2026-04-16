/**
 * admin.audit router.
 *
 * Historical responsibilities (Phase 6 — SYL-24):
 *   - list / markResolved / runNow for training-record audit exceptions.
 *     These continue to back `/admin/audit/training-records`.
 *
 * Phase 8 additions (Plan 08-03):
 *   - logs.query       — REP-01 general-purpose audit_log filter + keyset
 *   - activityTrail.query — REP-02 training activity trail view
 *
 * Both Phase 8 procedures are admin-gated and scoped to the caller's
 * school via the existing RLS context. Keyset pagination follows
 * RESEARCH Pattern 5 — cursor on (at desc, id desc) for audit_log and
 * (ramp_out_at desc nulls last, reservation_id desc) for the trail.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

// Lenient UUID pattern matching 07-01 geofence router precedent.
const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID format');

// ---------------------------------------------------------------------------
// Phase 6 (SYL-24) — training-record audit exceptions
// ---------------------------------------------------------------------------
const trainingRecordsList = adminProcedure
  .input(
    z
      .object({
        severity: z.enum(['info', 'warn', 'critical']).optional(),
        studentId: uuidString.optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .optional(),
  )
  .query(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const sev = input?.severity ?? null;
    const stuId = input?.studentId ?? null;
    const lim = input?.limit ?? 100;

    const rows = (await tx.execute(sql`
      select
        e.*,
        stu.full_name as student_name
      from public.training_record_audit_exception e
      left join public.student_course_enrollment sce on sce.id = e.student_enrollment_id
      left join public.users stu on stu.id = sce.user_id
      where e.resolved_at is null
        and (${sev}::text is null or e.severity::text = ${sev}::text)
        and (${stuId}::uuid is null or sce.user_id = ${stuId}::uuid)
      order by
        case e.severity
          when 'critical' then 0
          when 'warn' then 1
          else 2
        end,
        e.last_detected_at desc
      limit ${lim}
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  });

const trainingRecordsMarkResolved = adminProcedure
  .input(z.object({ exceptionId: uuidString }))
  .mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const rows = (await tx.execute(sql`
      update public.training_record_audit_exception
      set resolved_at = now()
      where id = ${input.exceptionId}::uuid
        and resolved_at is null
      returning id
    `)) as unknown as Array<{ id: string }>;
    if (!rows[0]) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Exception not found or already resolved',
      });
    }
    return { resolved: true };
  });

const trainingRecordsRunNow = adminProcedure.mutation(async ({ ctx }) => {
  const tx = ctx.tx as Tx;
  await tx.execute(sql`select public.run_training_record_audit()`);
  const countRows = (await tx.execute(sql`
    select count(*)::int as open_count
    from public.training_record_audit_exception
    where resolved_at is null
  `)) as unknown as Array<{ open_count: number }>;
  return { openCount: countRows[0]?.open_count ?? 0 };
});

const trainingRecordsRouter = router({
  list: trainingRecordsList,
  markResolved: trainingRecordsMarkResolved,
  runNow: trainingRecordsRunNow,
});

// ---------------------------------------------------------------------------
// Phase 8 (REP-01) — general-purpose audit_log query
// ---------------------------------------------------------------------------
interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  actor_kind: string;
  actor_role: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  before: unknown;
  after: unknown;
  at: string;
}

const logsRouter = router({
  query: adminProcedure
    .input(
      z.object({
        userId: uuidString.optional(),
        tableName: z.string().min(1).max(64).optional(),
        recordId: uuidString.optional(),
        action: z.enum(['insert', 'update', 'soft_delete']).optional(),
        from: z.string().datetime(),
        to: z.string().datetime(),
        cursor: z
          .object({
            at: z.string().datetime(),
            id: z.string(), // bigint rendered as string by prior page
          })
          .optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const userId = input.userId ?? null;
      const tableName = input.tableName ?? null;
      const recordId = input.recordId ?? null;
      const action = input.action ?? null;
      const cursorAt = input.cursor?.at ?? null;
      const cursorId = input.cursor?.id ?? null;
      const lim = input.limit;

      const rows = (await tx.execute(sql`
        select
          l.id::text       as id,
          l.user_id        as user_id,
          u.email          as user_email,
          l.actor_kind     as actor_kind,
          l.actor_role     as actor_role,
          l.table_name     as table_name,
          l.record_id      as record_id,
          l.action::text   as action,
          l.before         as before,
          l.after          as after,
          l.at             as at
        from public.audit_log l
        left join public.users u on u.id = l.user_id
        where l.school_id = ${ctx.session!.schoolId}::uuid
          and (${userId}::uuid    is null or l.user_id    = ${userId}::uuid)
          and (${tableName}::text is null or l.table_name = ${tableName}::text)
          and (${recordId}::uuid  is null or l.record_id  = ${recordId}::uuid)
          and (${action}::text    is null or l.action::text = ${action}::text)
          and l.at >= ${input.from}::timestamptz
          and l.at <  ${input.to}::timestamptz
          and (
            ${cursorAt}::timestamptz is null
            or (l.at, l.id) < (${cursorAt}::timestamptz, ${cursorId}::bigint)
          )
        order by l.at desc, l.id desc
        limit ${lim + 1}
      `)) as unknown as AuditLogRow[];

      const items = rows.slice(0, lim);
      const nextRow = rows.length > lim ? rows[rows.length - 1] : null;
      const nextCursor = nextRow
        ? { at: new Date(nextRow.at).toISOString(), id: nextRow.id }
        : null;

      return { items, nextCursor };
    }),
});

// ---------------------------------------------------------------------------
// Phase 8 (REP-02) — training activity trail view
// ---------------------------------------------------------------------------
interface ActivityTrailRow {
  reservation_id: string;
  school_id: string;
  base_id: string | null;
  activity_type: string;
  student_id: string | null;
  instructor_id: string | null;
  requested_by: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  ramp_out_at: string | null;
  ramp_in_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  grade_sheet_count: number;
  status: string;
  close_out_reason: string | null;
  requester_email: string | null;
  authorizer_email: string | null;
  student_name: string | null;
  instructor_name: string | null;
}

const activityTrailRouter = router({
  query: adminProcedure
    .input(
      z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        studentId: uuidString.optional(),
        instructorId: uuidString.optional(),
        baseId: uuidString.optional(),
        cursor: z
          .object({
            rampOutAt: z.string().datetime().nullable(),
            id: uuidString,
          })
          .optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const studentId = input.studentId ?? null;
      const instructorId = input.instructorId ?? null;
      const baseId = input.baseId ?? null;
      const cursorRampOut = input.cursor?.rampOutAt ?? null;
      const cursorId = input.cursor?.id ?? null;
      const lim = input.limit;

      const rows = (await tx.execute(sql`
        select
          t.reservation_id,
          t.school_id,
          t.base_id,
          t.activity_type::text as activity_type,
          t.student_id,
          t.instructor_id,
          t.requested_by,
          t.requested_at,
          t.approved_by,
          t.approved_at,
          t.ramp_out_at,
          t.ramp_in_at,
          t.closed_at,
          t.closed_by,
          t.grade_sheet_count,
          t.status::text           as status,
          t.close_out_reason::text as close_out_reason,
          req.email                as requester_email,
          aut.email                as authorizer_email,
          stu.full_name            as student_name,
          ins.full_name            as instructor_name
        from public.training_activity_trail t
        left join public.users req on req.id = t.requested_by
        left join public.users aut on aut.id = t.approved_by
        left join public.users stu on stu.id = t.student_id
        left join public.users ins on ins.id = t.instructor_id
        where t.school_id = ${ctx.session!.schoolId}::uuid
          and (t.requested_at >= ${input.from}::timestamptz or t.requested_at is null)
          and (t.requested_at <  ${input.to}::timestamptz   or t.requested_at is null)
          and (${studentId}::uuid    is null or t.student_id    = ${studentId}::uuid)
          and (${instructorId}::uuid is null or t.instructor_id = ${instructorId}::uuid)
          and (${baseId}::uuid       is null or t.base_id       = ${baseId}::uuid)
          and (
            ${cursorRampOut}::timestamptz is null
            or t.ramp_out_at is null
            or (t.ramp_out_at, t.reservation_id) < (${cursorRampOut}::timestamptz, ${cursorId}::uuid)
          )
        order by t.ramp_out_at desc nulls last, t.reservation_id desc
        limit ${lim + 1}
      `)) as unknown as ActivityTrailRow[];

      const items = rows.slice(0, lim);
      const nextRow = rows.length > lim ? rows[rows.length - 1] : null;
      const nextCursor = nextRow
        ? {
            rampOutAt: nextRow.ramp_out_at ? new Date(nextRow.ramp_out_at).toISOString() : null,
            id: nextRow.reservation_id,
          }
        : null;

      return { items, nextCursor };
    }),
});

// ---------------------------------------------------------------------------
// Exported router — preserves Phase 6 procedures at the top level AND
// exposes Phase 8 sub-routers (logs, activityTrail, trainingRecords).
//
// Existing callers using `admin.audit.list` / `admin.audit.markResolved`
// / `admin.audit.runNow` continue to work. New callers use
// `admin.audit.logs.query` / `admin.audit.activityTrail.query`.
// ---------------------------------------------------------------------------
export const adminAuditRouter = router({
  list: trainingRecordsList,
  markResolved: trainingRecordsMarkResolved,
  runNow: trainingRecordsRunNow,
  logs: logsRouter,
  activityTrail: activityTrailRouter,
  trainingRecords: trainingRecordsRouter,
});
