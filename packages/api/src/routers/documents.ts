/**
 * documents router — FND-07 personal-document storage.
 *
 * Flow (see 01-04-PLAN §interfaces and 01-RESEARCH §Pattern 8):
 *
 *   1. Client calls createSignedUploadUrl with {kind, mimeType, byteSize}
 *      → server validates, generates a UUID, builds the canonical
 *        storagePath(schoolId, userId, documentId, ext), asks Supabase
 *        Storage for a signed upload URL (service-role client),
 *        returns { documentId, path, signedUrl, token }.
 *   2. Client PUTs the file bytes directly to signedUrl.
 *   3. Client calls finalizeUpload with the same {documentId, path,
 *      kind, mimeType, byteSize, expiresAt?}. Server re-derives the
 *      expected path and rejects tampered paths, then inserts the
 *      documents row via the tenant transaction (audit trigger fires).
 *   4. list() returns the caller's non-deleted documents.
 *   5. createSignedDownloadUrl performs a Drizzle SELECT scoped to
 *      schoolId+userId and, on hit, returns a 5-minute signed URL.
 *   6. softDelete updates deleted_at=now(); audit trigger records
 *      the soft_delete action.
 *
 * Invariants:
 *   - The client NEVER constructs a storage path. Only storagePath()
 *     in @part61/domain does (Pitfall 7).
 *   - The service-role Supabase client is created lazily inside each
 *     procedure, never at module load (mirrors auth.ts, Pitfall 2).
 *   - createSignedUploadUrl is a *mutation*, not a query — it
 *     materialises a server-signed token the caller intends to use.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { documents, aircraft } from '@part61/db';
import {
  ALLOWED_MIME_TYPES,
  DocumentKind,
  MAX_BYTE_SIZE,
  MimeType,
  extForMime,
  isAllowedMime,
  storagePath,
} from '@part61/domain';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';

// --- lazy service-role client ------------------------------------------------

interface SupabaseStorageApi {
  from(bucket: string): {
    createSignedUploadUrl(path: string): Promise<{
      data: { signedUrl: string; token: string; path: string } | null;
      error: { message: string } | null;
    }>;
    createSignedUrl(
      path: string,
      expiresIn: number,
    ): Promise<{
      data: { signedUrl: string } | null;
      error: { message: string } | null;
    }>;
  };
}

async function getServiceRoleStorage(): Promise<SupabaseStorageApi> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Supabase admin credentials are not configured',
    });
  }
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin.storage as unknown as SupabaseStorageApi;
}

// --- inputs ------------------------------------------------------------------

const createSignedUploadUrlInput = z.object({
  kind: DocumentKind,
  mimeType: MimeType,
  byteSize: z.number().int().positive().max(MAX_BYTE_SIZE),
  expiresAt: z.date().optional(),
});

const uploadAircraftPhotoInput = z.object({
  aircraftId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  mimeType: MimeType,
  byteSize: z.number().int().positive().max(MAX_BYTE_SIZE),
});

const finalizeUploadInput = z.object({
  documentId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  kind: DocumentKind,
  path: z.string().min(1),
  mimeType: MimeType,
  byteSize: z.number().int().positive().max(MAX_BYTE_SIZE),
  expiresAt: z.date().optional(),
});

const documentIdInput = z.object({
  documentId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
});

// Minimal Drizzle-transaction shape we actually use. Keeping this
// narrow avoids pulling a concrete PgTransaction generic through
// every procedure and matches the pattern already used in auth.ts.
type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

// --- router ------------------------------------------------------------------

export const documentsRouter = router({
  /**
   * Generate a server-signed upload URL. We do NOT insert a row yet —
   * finalizeUpload does that after the client confirms the PUT. This
   * keeps failed uploads from leaving orphan metadata rows.
   */
  createSignedUploadUrl: protectedProcedure
    .input(createSignedUploadUrlInput)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session!;
      if (!isAllowedMime(input.mimeType)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `mimeType must be one of ${ALLOWED_MIME_TYPES.join(', ')}`,
        });
      }
      const documentId = crypto.randomUUID();
      const ext = extForMime(input.mimeType);
      const path = storagePath(session.schoolId, session.userId, documentId, ext);

      const storage = await getServiceRoleStorage();
      const { data, error } = await storage.from('documents').createSignedUploadUrl(path);
      if (error || !data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message ?? 'Failed to create signed upload URL',
        });
      }
      return {
        documentId,
        path,
        signedUrl: data.signedUrl,
        token: data.token,
      };
    }),

  /**
   * Insert the documents row once the client confirms the PUT
   * succeeded. Verifies that the path the client reports matches
   * the canonical storagePath() for this session+documentId — any
   * mismatch is path tampering and aborts.
   */
  finalizeUpload: protectedProcedure.input(finalizeUploadInput).mutation(async ({ ctx, input }) => {
    const session = ctx.session!;
    const ext = extForMime(input.mimeType);
    const expected = storagePath(session.schoolId, session.userId, input.documentId, ext);
    if (input.path !== expected) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'storage path does not match session + documentId + mimeType',
      });
    }
    const tx = ctx.tx as Tx;
    const rows = await tx
      .insert(documents)
      .values({
        id: input.documentId,
        schoolId: session.schoolId,
        userId: session.userId,
        kind: input.kind,
        storagePath: input.path,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        expiresAt: input.expiresAt,
        uploadedBy: session.userId,
      })
      .returning();
    const inserted = rows[0];
    if (!inserted) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Document row insert returned no rows',
      });
    }
    return inserted;
  }),

  /**
   * Lists the caller's non-deleted documents. The where clause is
   * explicit (schoolId + userId) even though RLS would also enforce
   * it, because the runtime connection uses DATABASE_URL and may not
   * carry a JWT — defense in depth.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const session = ctx.session!;
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.schoolId, session.schoolId),
          eq(documents.userId, session.userId),
          isNull(documents.deletedAt),
        ),
      )
      .orderBy(desc(documents.uploadedAt));
    return rows;
  }),

  /**
   * Returns a short-lived (5 minute) signed download URL for a
   * document the caller owns. Admins of the same school can also
   * download any document in their school (read-everything-in-school
   * is an explicit admin privilege per CONTEXT §Roles).
   */
  createSignedDownloadUrl: protectedProcedure
    .input(documentIdInput)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session!;
      const tx = ctx.tx as Tx;
      const whereClause =
        session.activeRole === 'admin'
          ? and(
              eq(documents.id, input.documentId),
              eq(documents.schoolId, session.schoolId),
              isNull(documents.deletedAt),
            )
          : and(
              eq(documents.id, input.documentId),
              eq(documents.schoolId, session.schoolId),
              eq(documents.userId, session.userId),
              isNull(documents.deletedAt),
            );
      const rows = await tx.select().from(documents).where(whereClause).limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
      }
      const storage = await getServiceRoleStorage();
      const { data, error } = await storage.from('documents').createSignedUrl(row.storagePath, 300);
      if (error || !data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message ?? 'Failed to create signed download URL',
        });
      }
      return { url: data.signedUrl, expiresIn: 300 };
    }),

  /**
   * Soft delete. The audit trigger detects the NULL → non-NULL
   * deleted_at transition and writes an audit row with
   * action='soft_delete'. Hard delete is blocked by
   * fn_block_hard_delete at the trigger level.
   */
  /**
   * Aircraft photo upload (FLT-06).
   *
   * Validates the aircraftId belongs to the caller's school, then
   * issues a signed upload URL. finalizeUpload handles the insert as
   * usual; the client also calls a follow-up setter (not implemented
   * here — Plan 04 wires the aircraft detail page to stamp
   * documents.aircraft_id after finalize). For now we return the
   * signed URL plus the documentId so the UI can stitch it together.
   */
  uploadAircraftPhoto: protectedProcedure
    .input(uploadAircraftPhotoInput)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session!;
      if (!isAllowedMime(input.mimeType)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `mimeType must be one of ${ALLOWED_MIME_TYPES.join(', ')}`,
        });
      }
      const tx = ctx.tx as Tx;
      // Scope check: aircraft must live in caller's school.
      const rows = await tx
        .select({ id: aircraft.id })
        .from(aircraft)
        .where(
          and(
            eq(aircraft.id, input.aircraftId),
            eq(aircraft.schoolId, session.schoolId),
          ),
        )
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aircraft not found' });
      }
      const documentId = crypto.randomUUID();
      const ext = extForMime(input.mimeType);
      const path = storagePath(session.schoolId, session.userId, documentId, ext);
      const storage = await getServiceRoleStorage();
      const { data, error } = await storage
        .from('documents')
        .createSignedUploadUrl(path);
      if (error || !data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message ?? 'Failed to create signed upload URL',
        });
      }
      return {
        documentId,
        path,
        signedUrl: data.signedUrl,
        token: data.token,
        kind: 'aircraft_photo' as const,
        aircraftId: input.aircraftId,
      };
    }),

  softDelete: protectedProcedure.input(documentIdInput).mutation(async ({ ctx, input }) => {
    const session = ctx.session!;
    const tx = ctx.tx as Tx;
    const rows = await tx
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(documents.id, input.documentId),
          eq(documents.schoolId, session.schoolId),
          eq(documents.userId, session.userId),
          isNull(documents.deletedAt),
        ),
      )
      .returning({ id: documents.id });
    if (rows.length === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Document not found or already deleted',
      });
    }
    return { ok: true };
  }),
});
