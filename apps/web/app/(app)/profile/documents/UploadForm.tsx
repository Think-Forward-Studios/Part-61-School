'use client';

/**
 * UploadForm — client-side upload orchestration.
 *
 * Flow:
 *   1. Client-side pre-flight: size <= MAX_BYTE_SIZE, MIME in allowlist.
 *   2. trpc.documents.createSignedUploadUrl.mutate → { documentId, path, signedUrl }
 *   3. PUT the file directly to signedUrl (Content-Type must match).
 *   4. trpc.documents.finalizeUpload.mutate → inserts the row.
 *   5. router.refresh() to re-fetch the server-rendered list.
 *
 * We intentionally never construct the storage path here — the
 * server returns it and we echo it back in finalizeUpload so the
 * server can re-verify tamper-freeness.
 *
 * The expiresAt field is only shown for 'medical' (which has a real
 * calendar expiration). Other kinds pass undefined.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ALLOWED_MIME_TYPES, MAX_BYTE_SIZE, type DocumentKind } from '@part61/domain';
import { trpc } from '@/lib/trpc/client';

const KIND_OPTIONS: Array<{ value: DocumentKind; label: string }> = [
  { value: 'medical', label: 'Medical' },
  { value: 'pilot_license', label: 'Pilot License' },
  { value: 'government_id', label: 'Government ID' },
  { value: 'insurance', label: 'Insurance' },
];

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'success' };

export function UploadForm() {
  const router = useRouter();
  const [kind, setKind] = useState<DocumentKind>('medical');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const createUrl = trpc.documents.createSignedUploadUrl.useMutation();
  const finalize = trpc.documents.finalizeUpload.useMutation();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setStatus({ kind: 'error', message: 'Choose a file to upload.' });
      return;
    }
    if (file.size > MAX_BYTE_SIZE) {
      setStatus({ kind: 'error', message: 'File exceeds 25 MB limit.' });
      return;
    }
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      setStatus({ kind: 'error', message: 'Only PDF, JPEG, or PNG are allowed.' });
      return;
    }
    const expiresDate = kind === 'medical' && expiresAt ? new Date(expiresAt) : undefined;

    try {
      setStatus({ kind: 'uploading', message: 'Requesting signed upload URL…' });
      const signed = await createUrl.mutateAsync({
        kind,
        mimeType: file.type as (typeof ALLOWED_MIME_TYPES)[number],
        byteSize: file.size,
        expiresAt: expiresDate,
      });

      setStatus({ kind: 'uploading', message: 'Uploading file…' });
      const putRes = await fetch(signed.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }

      setStatus({ kind: 'uploading', message: 'Finalizing…' });
      await finalize.mutateAsync({
        documentId: signed.documentId,
        kind,
        path: signed.path,
        mimeType: file.type as (typeof ALLOWED_MIME_TYPES)[number],
        byteSize: file.size,
        expiresAt: expiresDate,
      });

      form.reset();
      setExpiresAt('');
      setStatus({ kind: 'success' });
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setStatus({ kind: 'error', message });
    }
  }

  const busy = status.kind === 'uploading';

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem',
        border: '1px solid #ccc',
        borderRadius: 6,
        marginTop: '1rem',
      }}
    >
      <label>
        Document type{' '}
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as DocumentKind)}
          disabled={busy}
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {kind === 'medical' ? (
        <label>
          Expires{' '}
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            disabled={busy}
          />
        </label>
      ) : null}

      <label>
        File{' '}
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,application/pdf"
          disabled={busy}
          required
        />
      </label>

      <button type="submit" disabled={busy}>
        {busy ? 'Working…' : 'Upload'}
      </button>

      {status.kind === 'uploading' ? <p>{status.message}</p> : null}
      {status.kind === 'error' ? <p style={{ color: 'crimson' }}>{status.message}</p> : null}
      {status.kind === 'success' ? <p style={{ color: 'green' }}>Upload complete.</p> : null}
    </form>
  );
}
