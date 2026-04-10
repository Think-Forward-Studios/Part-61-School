/**
 * admin/geofence router (ADS-05).
 *
 * CRUD for the geofence table. One active geofence per base (partial
 * unique index). Upserting soft-deletes the old geofence before
 * inserting the new one. All mutations run inside withTenantTx.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { geofence } from '@part61/db';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

/**
 * Basic GeoJSON structural check: must have `type` and `coordinates`.
 */
function validateGeometry(geo: unknown): void {
  if (typeof geo !== 'object' || geo === null || !('type' in geo) || !('coordinates' in geo)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'geometry must be valid GeoJSON with type and coordinates',
    });
  }
}

export const adminGeofenceRouter = router({
  /**
   * Get the active (non-deleted) geofence for the user's active base.
   * If no active base is set, returns the first active geofence for the school.
   */
  getActive: adminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const baseId = ctx.session!.activeBaseId;

    if (baseId) {
      const rows = await tx
        .select()
        .from(geofence)
        .where(
          and(
            eq(geofence.schoolId, ctx.session!.schoolId),
            eq(geofence.baseId, baseId),
            isNull(geofence.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    }

    // No base context: return first active geofence for school
    const rows = await tx
      .select()
      .from(geofence)
      .where(and(eq(geofence.schoolId, ctx.session!.schoolId), isNull(geofence.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }),

  /**
   * Upsert a geofence: soft-delete any existing active geofence for
   * this base, then insert the new one.
   */
  upsert: adminProcedure
    .input(
      z.object({
        baseId: z
          .string()
          .regex(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            'Invalid UUID format',
          ),
        kind: z.enum(['polygon', 'circle']),
        geometry: z.unknown(),
        radiusNm: z.number().positive().optional(),
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      validateGeometry(input.geometry);

      // Validate: circle must have radiusNm
      if (input.kind === 'circle' && input.radiusNm == null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Circle geofence requires radiusNm',
        });
      }

      // Soft-delete existing active geofence for this base
      await tx
        .update(geofence)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(geofence.schoolId, ctx.session!.schoolId),
            eq(geofence.baseId, input.baseId),
            isNull(geofence.deletedAt),
          ),
        );

      // Insert the new one
      const rows = await tx
        .insert(geofence)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: input.baseId,
          kind: input.kind,
          geometry: input.geometry,
          radiusNm: input.radiusNm?.toString() ?? null,
          label: input.label ?? 'Training Area',
          createdBy: ctx.session!.userId,
        })
        .returning();

      return rows[0]!;
    }),

  /**
   * Soft-delete a geofence by id.
   */
  softDelete: adminProcedure
    .input(
      z.object({
        id: z
          .string()
          .regex(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            'Invalid UUID format',
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(geofence)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(geofence.id, input.id),
            eq(geofence.schoolId, ctx.session!.schoolId),
            isNull(geofence.deletedAt),
          ),
        )
        .returning();

      if (rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active geofence not found',
        });
      }

      return { success: true as const };
    }),
});
