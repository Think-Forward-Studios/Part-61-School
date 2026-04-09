/**
 * Signer snapshot shape (locked per Phase 4 CONTEXT).
 *
 * Copied, not referenced: once a signature is captured, mutating the
 * mechanic's person_profile row does NOT retroactively change past
 * signatures. This is the FAA-inspection integrity contract.
 */
import { z } from 'zod';

export const signerSnapshotSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().min(1),
  certificate_type: z.enum(['a_and_p', 'ia']),
  certificate_number: z.string().min(1),
  signed_at: z.string(),
});

export type SignerSnapshot = z.infer<typeof signerSnapshotSchema>;
