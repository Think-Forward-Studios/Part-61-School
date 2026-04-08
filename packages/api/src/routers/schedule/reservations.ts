/**
 * schedule.reservations sub-router (SCH-01, SCH-02, SCH-03, SCH-08,
 * SCH-09, SCH-13, SCH-15, SCH-18).
 *
 * Wraps the core reservation lifecycle in per-procedure tRPC middleware:
 * request / approve / list / update / cancel / markNoShow.
 *
 * All mutations run through withTenantTx so app.school_id / app.base_id
 * GUCs are set for RLS. The approve step re-checks is_airworthy_at()
 * and the active person_hold table, and maps the exclusion-constraint
 * error (SQLSTATE 23P01) to a TRPCError('CONFLICT') with a user-friendly
 * message naming the colliding row.
 *
 * USER-FACING LANGUAGE NOTE (banned-terms rule): any message string that
 * a human reader will see must NOT contain the word "approved" — we use
 * "Confirmed" as the display label. Internal enum values like
 * `status='approved'` are fine.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import {
  noShow,
  personHold,
  reservation,
  scheduleBlockInstance,
} from '@part61/db';
import {
  reservationApproveInput,
  reservationCancelInput,
  reservationIdInput,
  reservationListInput,
  reservationMarkNoShowInput,
  reservationRequestInput,
  reservationUpdateInput,
} from '@part61/domain';
import { router } from '../../trpc';
import {
  instructorOrAdminProcedure,
  protectedProcedure,
} from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  delete: (typeof import('@part61/db').db)['delete'];
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

function rangeLiteral(start: Date, end: Date): string {
  return `[${start.toISOString()},${end.toISOString()})`;
}

/**
 * Parse a Postgres tstzrange literal's lower bound to an ISO 8601
 * string suitable for `new Date()`. Postgres renders the lower bound
 * inside double-quotes when the value contains whitespace, e.g.
 *   ["2027-01-10 14:00:00+00","2027-01-10 15:30:00+00")
 * We strip the quote and convert the single-space delimiter to 'T'.
 */
function parseLowerBound(range: string): string {
  const match = range.match(/^\[(?:"([^"]+)"|([^,]+)),/);
  const raw = (match?.[1] ?? match?.[2] ?? '').trim();
  if (!raw) return new Date().toISOString();
  // Normalize "2027-01-10 14:00:00+00" → "2027-01-10T14:00:00+00:00"
  let iso = raw.replace(' ', 'T');
  // Postgres abbreviates "+00" → expand to "+00:00" for Date parser.
  iso = iso.replace(/([+-]\d{2})$/, '$1:00');
  return iso;
}

/**
 * Expand a recurrence definition to a list of concrete {start,end} pairs.
 * `daysOfWeek` uses 0=Sunday..6=Saturday.
 */
function expandRecurrence(
  startsAt: Date,
  endsAt: Date,
  rec: NonNullable<
    import('@part61/domain').ReservationRequestInput['recurrence']
  >,
): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];
  const durationMs = endsAt.getTime() - startsAt.getTime();
  const days = rec.daysOfWeek && rec.daysOfWeek.length > 0 ? rec.daysOfWeek : null;
  const stepDays = rec.frequency === 'daily' ? 1 : 1; // weekly walks daily, filters by day-of-week
  const maxCount = rec.count ?? 52;
  const until = rec.until ?? null;
  const cursor = new Date(startsAt);
  let emitted = 0;
  // Safety rail: bound at 500 iterations no matter what.
  for (let i = 0; i < 500 && emitted < maxCount; i++) {
    if (until && cursor.getTime() > until.getTime()) break;
    const dow = cursor.getUTCDay();
    const include =
      rec.frequency === 'daily' ? true : days ? days.includes(dow) : dow === startsAt.getUTCDay();
    if (include) {
      out.push({
        start: new Date(cursor),
        end: new Date(cursor.getTime() + durationMs),
      });
      emitted++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  }
  return out;
}

async function assertAirworthyAt(
  tx: Tx,
  aircraftId: string,
  at: Date,
): Promise<void> {
  const rows = (await tx.execute(
    sql`select public.is_airworthy_at(${aircraftId}::uuid, ${at.toISOString()}::timestamptz) as ok`,
  )) as unknown as Array<{ ok: boolean }>;
  if (!rows[0]?.ok) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Aircraft is not airworthy at the requested time',
    });
  }
}

async function assertNoActiveHold(
  tx: Tx,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  const rows = await tx
    .select({ id: personHold.id })
    .from(personHold)
    .where(
      and(eq(personHold.userId, userId), sql`${personHold.clearedAt} is null`),
    )
    .limit(1);
  if (rows.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Person has an active hold or grounding',
    });
  }
}

function mapPostgresError(err: unknown): never {
  const e = err as { code?: string; message?: string; constraint_name?: string };
  if (e && e.code === '23P01') {
    const which = e.constraint_name ?? '';
    let resource = 'resource';
    if (which.includes('aircraft')) resource = 'aircraft';
    else if (which.includes('instructor')) resource = 'instructor';
    else if (which.includes('student')) resource = 'student';
    else if (which.includes('room')) resource = 'room';
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Schedule conflict: the ${resource} is already booked for an overlapping time window`,
    });
  }
  throw err as Error;
}

export const scheduleReservationsRouter = router({
  request: protectedProcedure
    .input(reservationRequestInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const baseId = ctx.session!.activeBaseId;
      if (!baseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No active base in session',
        });
      }

      // If parentBlockInstanceId is provided, inherit instructor/aircraft/room
      // from the parent block via the trigger (BEFORE INSERT). We still pass
      // any explicit fields so the caller can override.
      let parentBlockId: string | null = null;
      if (input.parentBlockInstanceId) {
        const inst = await tx
          .select()
          .from(scheduleBlockInstance)
          .where(eq(scheduleBlockInstance.id, input.parentBlockInstanceId))
          .limit(1);
        if (inst.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Block instance not found',
          });
        }
        parentBlockId = input.parentBlockInstanceId;
      }

      // Expand recurrence if requested; otherwise a single instance.
      const instances = input.recurrence
        ? expandRecurrence(input.startsAt, input.endsAt, input.recurrence)
        : [{ start: input.startsAt, end: input.endsAt }];

      const seriesId = instances.length > 1 ? crypto.randomUUID() : null;

      try {
        const inserted: Array<{ id: string }> = [];
        for (const inst of instances) {
          const rangeLit = rangeLiteral(inst.start, inst.end);
          const rows = (await tx.execute(sql`
            insert into public.reservation (
              school_id, base_id, activity_type, time_range, status,
              aircraft_id, instructor_id, student_id, room_id,
              series_id, parent_block_id, notes, requested_by,
              route_string, ete_minutes, stops, fuel_stops, alternate
            ) values (
              ${schoolId}::uuid,
              ${baseId}::uuid,
              ${input.activityType}::public.reservation_activity_type,
              ${rangeLit}::tstzrange,
              'requested',
              ${input.aircraftId ?? null}::uuid,
              ${input.instructorId ?? null}::uuid,
              ${input.studentId ?? null}::uuid,
              ${input.roomId ?? null}::uuid,
              ${seriesId}::uuid,
              ${parentBlockId}::uuid,
              ${input.notes ?? null},
              ${ctx.session!.userId}::uuid,
              ${input.routeString ?? null},
              ${input.eteMinutes ?? null},
              ${(input.stops ?? null) as string[] | null},
              ${(input.fuelStops ?? null) as string[] | null},
              ${input.alternate ?? null}
            )
            returning id
          `)) as unknown as Array<{ id: string }>;
          if (rows[0]) inserted.push(rows[0]);
        }
        return { reservationIds: inserted.map((r) => r.id), seriesId };
      } catch (err) {
        mapPostgresError(err);
      }
    }),

  approve: instructorOrAdminProcedure
    .input(reservationApproveInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(reservation)
        .where(
          and(
            eq(reservation.id, input.reservationId),
            eq(reservation.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const r = rows[0];
      if (!r) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }
      if (r.status !== 'requested') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Reservation is not pending (current status: ${r.status})`,
        });
      }
      // Airworthiness gate (flight only).
      if (r.activityType === 'flight' && r.aircraftId) {
        const startIso = parseLowerBound(r.timeRange);
        await assertAirworthyAt(tx, r.aircraftId, new Date(startIso));
      }
      // Person hold gate.
      await assertNoActiveHold(tx, r.studentId);
      await assertNoActiveHold(tx, r.instructorId);

      try {
        const updated = await tx
          .update(reservation)
          .set({
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: ctx.session!.userId,
          })
          .where(eq(reservation.id, input.reservationId))
          .returning();
        return updated[0]!;
      } catch (err) {
        mapPostgresError(err);
      }
    }),

  list: protectedProcedure
    .input(reservationListInput)
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const mode = input.mode;
      const role = ctx.session!.activeRole;
      const userId = ctx.session!.userId;
      const schoolId = ctx.session!.schoolId;

      if (mode === 'full' && role !== 'instructor' && role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only instructors or admins may view full schedule details',
        });
      }

      if (mode === 'freebusy') {
        if (!input.resourceType || !input.resourceId || !input.from || !input.to) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'resourceType, resourceId, from, to are required for freebusy',
          });
        }
        const rows = (await tx.execute(sql`
          select public.free_busy(
            ${input.resourceType}::text,
            ${input.resourceId}::uuid,
            ${input.from.toISOString()}::timestamptz,
            ${input.to.toISOString()}::timestamptz
          ) as range
        `)) as unknown as Array<{ range: string }>;
        return { mode: 'freebusy' as const, ranges: rows.map((r) => r.range) };
      }

      if (mode === 'mine') {
        const rows = (await tx.execute(sql`
          select *
            from public.reservation
           where school_id = ${schoolId}::uuid
             and (student_id = ${userId}::uuid
                  or instructor_id = ${userId}::uuid
                  or requested_by = ${userId}::uuid)
             and deleted_at is null
           order by time_range
           limit 500
        `)) as unknown as Array<Record<string, unknown>>;
        return { mode: 'mine' as const, rows };
      }

      const rows = (await tx.execute(sql`
        select *
          from public.reservation
         where school_id = ${schoolId}::uuid
           and deleted_at is null
         order by time_range
         limit 1000
      `)) as unknown as Array<Record<string, unknown>>;
      return { mode: 'full' as const, rows };
    }),

  update: instructorOrAdminProcedure
    .input(reservationUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const patch: Record<string, unknown> = {};
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.routeString !== undefined) patch.routeString = input.routeString;
      if (input.startsAt && input.endsAt) {
        // Rewrite the whole tstzrange via raw update below.
      }
      if (Object.keys(patch).length > 0) {
        await tx
          .update(reservation)
          .set(patch)
          .where(
            and(
              eq(reservation.id, input.reservationId),
              eq(reservation.schoolId, ctx.session!.schoolId),
            ),
          );
      }
      if (input.startsAt && input.endsAt) {
        const rangeLit = rangeLiteral(input.startsAt, input.endsAt);
        try {
          await tx.execute(sql`
            update public.reservation
               set time_range = ${rangeLit}::tstzrange
             where id = ${input.reservationId}::uuid
               and school_id = ${ctx.session!.schoolId}::uuid
          `);
        } catch (err) {
          mapPostgresError(err);
        }
      }
      return { ok: true };
    }),

  cancel: protectedProcedure
    .input(reservationCancelInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(reservation)
        .where(
          and(
            eq(reservation.id, input.reservationId),
            eq(reservation.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const r = rows[0];
      if (!r) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }
      if (['closed', 'flown', 'cancelled', 'no_show'].includes(r.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel a reservation in status ${r.status}`,
        });
      }
      // Derive free vs late if not explicitly provided.
      const startIso = parseLowerBound(r.timeRange);
      const startsAt = new Date(startIso);
      const hoursUntilStart = (startsAt.getTime() - Date.now()) / 3_600_000;
      const reason =
        input.reason ?? (hoursUntilStart >= 24 ? 'cancelled_free' : 'cancelled_late');

      const updated = await tx
        .update(reservation)
        .set({
          status: 'cancelled',
          closeOutReason: reason,
          closedAt: new Date(),
          closedBy: ctx.session!.userId,
          notes: input.notes ?? r.notes,
        })
        .where(eq(reservation.id, input.reservationId))
        .returning();
      return updated[0]!;
    }),

  markNoShow: instructorOrAdminProcedure
    .input(reservationMarkNoShowInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(reservation)
        .where(
          and(
            eq(reservation.id, input.reservationId),
            eq(reservation.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const r = rows[0];
      if (!r) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }
      if (!['approved', 'dispatched', 'requested'].includes(r.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot mark no-show on a reservation in status ${r.status}`,
        });
      }
      await tx
        .update(reservation)
        .set({
          status: 'no_show',
          closeOutReason: 'no_show',
          closedAt: new Date(),
          closedBy: ctx.session!.userId,
        })
        .where(eq(reservation.id, input.reservationId));
      // Write Phase 2 no_show row if the reservation had a student attached.
      if (r.studentId) {
        const startIso = parseLowerBound(r.timeRange);
        await tx.insert(noShow).values({
          schoolId: r.schoolId,
          userId: r.studentId,
          scheduledAt: new Date(startIso),
          aircraftId: r.aircraftId ?? null,
          instructorId: r.instructorId ?? null,
          lessonDescriptor: null,
          recordedBy: ctx.session!.userId,
          reason: input.notes ?? null,
        });
      }
      return { ok: true };
    }),

  getById: protectedProcedure
    .input(reservationIdInput)
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(reservation)
        .where(
          and(
            eq(reservation.id, input.reservationId),
            eq(reservation.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }
      return rows[0];
    }),
});
