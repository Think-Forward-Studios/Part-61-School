'use client';

/**
 * UploadForm — client-side upload orchestration.
 *
 * Flow:
 *   1. Pre-flight: size <= MAX_BYTE_SIZE, MIME in allowlist.
 *   2. trpc.documents.createSignedUploadUrl.mutate (with optional
 *      forUserId when an admin is operating on someone else) →
 *      { documentId, path, signedUrl }.
 *   3. PUT the file directly to signedUrl (Content-Type must match).
 *   4. trpc.documents.finalizeUpload.mutate (same forUserId) →
 *      inserts the documents row scoped to the target user.
 *   5. onUploaded() so the parent re-fetches the list.
 */
import { useState, type FormEvent } from 'react';
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

const LABEL: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  fontSize: '0.68rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};

const INPUT: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  background: '#05070e',
  border: '1px solid #1a2238',
  borderRadius: 6,
  color: '#f7f9fc',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
  letterSpacing: 'normal',
  textTransform: 'none',
  outline: 'none',
};

export function UploadForm({
  targetUserId,
  onUploaded,
}: {
  /** When set, admin is uploading on behalf of this user. */
  targetUserId?: string;
  onUploaded?: () => void;
}) {
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
        forUserId: targetUserId,
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
        forUserId: targetUserId,
      });

      form.reset();
      setExpiresAt('');
      setStatus({ kind: 'success' });
      onUploaded?.();
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
        marginTop: '1rem',
        padding: '1.1rem 1.2rem',
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.9rem',
      }}
    >
      <label
        style={{
          ...LABEL,
          gridColumn: kind === 'medical' ? 'span 1' : '1 / -1',
        }}
      >
        Document type
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as DocumentKind)}
          disabled={busy}
          style={INPUT}
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {kind === 'medical' ? (
        <label style={LABEL}>
          Expires
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            disabled={busy}
            style={INPUT}
          />
        </label>
      ) : null}

      <label style={{ ...LABEL, gridColumn: '1 / -1' }}>
        File
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,application/pdf"
          disabled={busy}
          required
          style={INPUT}
        />
      </label>

      <div
        style={{
          gridColumn: '1 / -1',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {status.kind === 'uploading' ? (
          <span style={{ color: '#7a869a', fontSize: '0.82rem' }}>{status.message}</span>
        ) : null}
        {status.kind === 'error' ? (
          <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{status.message}</span>
        ) : null}
        {status.kind === 'success' ? (
          <span style={{ color: '#34d399', fontSize: '0.82rem' }}>Upload complete.</span>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '0.55rem 1.1rem',
            background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
            color: '#0a0e1a',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Working…' : 'Upload'}
        </button>
      </div>
    </form>
  );
}
