/**
 * Phase 1 document-storage domain contract.
 *
 * Locked values (see 01-CONTEXT.md §Document Storage and 01-04-PLAN §interfaces):
 *   - Document kinds: medical | pilot_license | government_id | insurance
 *   - MIME allowlist: image/jpeg, image/png, application/pdf
 *   - Max byte size: 25 MiB
 *   - Storage path convention: school_<schoolId>/user_<userId>/<documentId>.<ext>
 *
 * These constants are imported by both the tRPC router (server-side
 * validation + path generation) and the upload UI (client-side
 * pre-flight). The storagePath() helper is the *only* place a storage
 * path is constructed — clients must never build paths themselves
 * (Pitfall 7 in 01-RESEARCH.md).
 */
import { z } from 'zod';

export const DocumentKind = z.enum(['medical', 'pilot_license', 'government_id', 'insurance', 'aircraft_photo']);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MimeType = z.enum(ALLOWED_MIME_TYPES);

export const MAX_BYTE_SIZE = 25 * 1024 * 1024; // 25 MiB

const MIME_TO_EXT: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export function extForMime(mime: string): string {
  return (MIME_TO_EXT as Record<string, string>)[mime] ?? 'bin';
}

export function isAllowedMime(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Canonical storage-path builder. Uses the exact prefix shape the
 * Supabase Storage RLS policies key off:
 *   school_<schoolId>/user_<userId>/<documentId>.<ext>
 *
 * `storage.foldername(name)` in Postgres returns the segments
 * without the leading slash, so segment[1] = 'school_<id>' and
 * segment[2] = 'user_<id>'.
 */
export function storagePath(
  schoolId: string,
  userId: string,
  documentId: string,
  ext: string,
): string {
  return `school_${schoolId}/user_${userId}/${documentId}.${ext}`;
}
