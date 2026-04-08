/**
 * dispatch router (FTR-01, FTR-02, FTR-03, FTR-06, FTR-08, SCH-08,
 * SCH-09, INS-04).
 *
 * Orchestrates the dispatch + close-out lifecycle on top of the
 * reservation state machine. Every mutation runs inside withTenantTx so
 * app.school_id + app.base_id GUCs are set for RLS. The close-out path
 * is the largest — it writes a paired flight_log_entry, creates any
 * observed squawks, and transitions the reservation status in a single
 * transaction.
 *
 * USER-FACING LANGUAGE NOTE: avoid "approved" in any message string
 * returned to humans — say "confirmed" instead. Internal data values
 * like `status='approved'` are fine.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  aircraft,
  aircraftSquawk,
  fifAcknowledgement,
  fifNotice,
  flightLogEntry,
  passengerManifest,
  reservation,
} from '@part61/db';
import {
  dispatchAuthorizeInput,
  dispatchCloseOutInput,
  dispatchFlightInput,
  dispatchMarkStudentPresentInput,
  openSquawkInput,
  passengerManifestUpsertInput,
} from '@part61/domain';
import { router } from '../trpc';
import {
  instructorOrAdminProcedure,
  protectedProcedure,
} from '../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  delete: (typeof import('@part61/db').db)['delete'];
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

function numStr(v: number | null | undefined): string | null {
  return v == null ? null : v.toFixed(1);
}

async function loadReservationOrThrow(
  tx: Tx,
  reservationId: string,
  schoolId: string,
) {
  const rows = await tx
    .select()
    .from(reservation)
    .where(
      and(eq(reservation.id, reservationId), eq(reservation.schoolId, schoolId)),
    )
    .limit(1);
  const r = rows[0];
  if (!r) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
  }
  return r;
}

async function assertAllFifAcked(
  tx: Tx,
  schoolId: string,
  userId: string,
): Promise<void> {
  const rows = (await tx.execute(sql`
    select n.id
      from public.fif_notice n
     where n.school_id = ${schoolId}::uuid
       and n.deleted_at is null
       and n.effective_at <= now()
       and (n.expires_at is null or n.expires_at > now())
       and not exists (
         select 1 from public.fif_acknowledgement a
          where a.notice_id = n.id and a.user_id = ${userId}::uuid
       )
     limit 1
  `)) as unknown as Array<{ id: string }>;
  if (rows.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Unacknowledged Flight Information File notices must be read before dispatch',
    });
  }
}

export const dispatchRouter = router({
  list: instructorOrAdminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;
    const currentlyFlying = (await tx.execute(sql`
      select * from public.reservation
       where school_id = ${schoolId}::uuid
         and status = 'dispatched'
         and deleted_at is null
       order by time_range
    `)) as unknown as Array<Record<string, unknown>>;
    const aboutToFly = (await tx.execute(sql`
      select * from public.reservation
       where school_id = ${schoolId}::uuid
         and status = 'approved'
         and lower(time_range) between now() and now() + interval '60 minutes'
         and deleted_at is null
       order by time_range
    `)) as unknown as Array<Record<string, unknown>>;
    const recentlyClosed = (await tx.execute(sql`
      select * from public.reservation
       where school_id = ${schoolId}::uuid
         and status in ('closed', 'flown', 'pending_sign_off')
         and closed_at > now() - interval '2 hours'
         and deleted_at is null
       order by closed_at desc
    `)) as unknown as Array<Record<string, unknown>>;
    return { currentlyFlying, aboutToFly, recentlyClosed };
  }),

  markStudentPresent: instructorOrAdminProcedure
    .input(dispatchMarkStudentPresentInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadReservationOrThrow(
        tx,
        input.reservationId,
        ctx.session!.schoolId,
      );
      await tx
        .update(reservation)
        .set({
          studentCheckedInAt: new Date(),
          studentCheckedInBy: ctx.session!.userId,
        })
        .where(eq(reservation.id, input.reservationId));
      return { ok: true };
    }),

  authorizeRelease: instructorOrAdminProcedure
    .input(dispatchAuthorizeInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadReservationOrThrow(
        tx,
        input.reservationId,
        ctx.session!.schoolId,
      );
      await tx
        .update(reservation)
        .set({
          instructorAuthorizedAt: new Date(),
          instructorAuthorizedBy: ctx.session!.userId,
        })
        .where(eq(reservation.id, input.reservationId));
      return { ok: true };
    }),

  dispatchReservation: instructorOrAdminProcedure
    .input(dispatchFlightInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const r = await loadReservationOrThrow(tx, input.reservationId, schoolId);
      if (r.status !== 'approved') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Reservation is not confirmed (current status: ${r.status})`,
        });
      }
      if (!r.studentCheckedInAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Student check-in is required before dispatch',
        });
      }
      if (!r.instructorAuthorizedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Instructor authorization is required before dispatch',
        });
      }
      // FIF gate — user being dispatched (student, or instructor if solo)
      const gateUserId = r.studentId ?? r.instructorId ?? ctx.session!.userId;
      await assertAllFifAcked(tx, schoolId, gateUserId);

      // Airworthiness at now() for flight activity.
      if (r.activityType === 'flight' && r.aircraftId) {
        const aw = (await tx.execute(
          sql`select public.is_airworthy_at(${r.aircraftId}::uuid, now()) as ok`,
        )) as unknown as Array<{ ok: boolean }>;
        if (!aw[0]?.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Aircraft is not airworthy at the requested time',
          });
        }
        if (input.hobbsOut == null || input.tachOut == null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'hobbsOut and tachOut are required to dispatch a flight',
          });
        }
        await tx.insert(flightLogEntry).values({
          schoolId,
          baseId: r.baseId,
          aircraftId: r.aircraftId,
          kind: 'flight_out',
          flownAt: new Date(),
          hobbsOut: numStr(input.hobbsOut),
          tachOut: numStr(input.tachOut),
          airframeDelta: '0',
          recordedBy: ctx.session!.userId,
        });
      }

      await tx
        .update(reservation)
        .set({
          status: 'dispatched',
          dispatchedAt: new Date(),
          dispatchedBy: ctx.session!.userId,
        })
        .where(eq(reservation.id, input.reservationId));
      return { ok: true };
    }),

  closeOut: protectedProcedure
    .input(dispatchCloseOutInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const r = await loadReservationOrThrow(tx, input.reservationId, schoolId);
      if (!['dispatched', 'pending_sign_off'].includes(r.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Reservation is not active (status: ${r.status})`,
        });
      }

      // For flight activities: write the paired flight_in row.
      if (r.activityType === 'flight' && r.aircraftId) {
        if (input.hobbsIn == null || input.tachIn == null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'hobbsIn and tachIn are required to close out a flight',
          });
        }
        // Find the paired flight_out row for this reservation. We match
        // by aircraft + most recent flight_out since dispatched_at.
        const outRows = await tx
          .select()
          .from(flightLogEntry)
          .where(
            and(
              eq(flightLogEntry.aircraftId, r.aircraftId),
              eq(flightLogEntry.kind, 'flight_out'),
            ),
          )
          .orderBy(sql`recorded_at desc`)
          .limit(1);
        const outRow = outRows[0];
        const delta =
          input.hobbsIn != null && outRow?.hobbsOut
            ? input.hobbsIn - Number(outRow.hobbsOut)
            : 0;
        await tx.insert(flightLogEntry).values({
          schoolId,
          baseId: r.baseId,
          aircraftId: r.aircraftId,
          kind: 'flight_in',
          flownAt: new Date(),
          hobbsIn: numStr(input.hobbsIn),
          tachIn: numStr(input.tachIn),
          airframeDelta: delta.toFixed(1),
          pairedEntryId: outRow?.id ?? null,
          recordedBy: ctx.session!.userId,
          notes: input.notes ?? null,
        });
      }

      // Create squawks. Grounding severity auto-grounds the aircraft.
      if (input.squawks.length > 0 && r.aircraftId) {
        for (const sq of input.squawks) {
          await tx.insert(aircraftSquawk).values({
            schoolId,
            baseId: r.baseId,
            aircraftId: r.aircraftId,
            severity: sq.severity,
            title: sq.title,
            description: sq.description ?? null,
            openedBy: ctx.session!.userId,
          });
          if (sq.severity === 'grounding') {
            await tx
              .update(aircraft)
              .set({ groundedAt: new Date() })
              .where(eq(aircraft.id, r.aircraftId));
          }
        }
      }

      // Status transition: instructor sign-off → closed; otherwise
      // pending_sign_off when the student saves first.
      const isInstructorOrAdmin =
        ctx.session!.activeRole === 'instructor' ||
        ctx.session!.activeRole === 'admin';
      const newStatus =
        input.signedOffByInstructor && isInstructorOrAdmin
          ? 'closed'
          : 'pending_sign_off';

      await tx
        .update(reservation)
        .set({
          status: newStatus,
          closedAt: newStatus === 'closed' ? new Date() : null,
          closedBy: newStatus === 'closed' ? ctx.session!.userId : null,
        })
        .where(eq(reservation.id, input.reservationId));

      return { ok: true, status: newStatus };
    }),

  openSquawk: protectedProcedure
    .input(openSquawkInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const acRows = await tx
        .select()
        .from(aircraft)
        .where(and(eq(aircraft.id, input.aircraftId), eq(aircraft.schoolId, schoolId)))
        .limit(1);
      const ac = acRows[0];
      if (!ac) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aircraft not found' });
      }
      const rows = await tx
        .insert(aircraftSquawk)
        .values({
          schoolId,
          baseId: ac.baseId,
          aircraftId: input.aircraftId,
          severity: input.severity,
          title: input.title,
          description: input.description ?? null,
          openedBy: ctx.session!.userId,
        })
        .returning();
      if (input.severity === 'grounding') {
        await tx
          .update(aircraft)
          .set({ groundedAt: new Date() })
          .where(eq(aircraft.id, input.aircraftId));
      }
      return rows[0]!;
    }),

  passengerManifestUpsert: instructorOrAdminProcedure
    .input(passengerManifestUpsertInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadReservationOrThrow(
        tx,
        input.reservationId,
        ctx.session!.schoolId,
      );
      await tx
        .delete(passengerManifest)
        .where(eq(passengerManifest.reservationId, input.reservationId));
      if (input.rows.length > 0) {
        await tx.insert(passengerManifest).values(
          input.rows.map((row) => ({
            reservationId: input.reservationId,
            position: row.position,
            name: row.name,
            weightLbs: row.weightLbs == null ? null : String(row.weightLbs),
            emergencyContactName: row.emergencyContactName ?? null,
            emergencyContactPhone: row.emergencyContactPhone ?? null,
            notes: row.notes ?? null,
          })),
        );
      }
      return { ok: true, count: input.rows.length };
    }),
});

// Silence unused imports we keep handy for future work.
void fifNotice;
void fifAcknowledgement;
void inArray;
