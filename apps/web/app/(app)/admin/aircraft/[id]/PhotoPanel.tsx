'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ALLOWED_MIME_TYPES, MAX_BYTE_SIZE } from '@part61/domain';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

/**
 * PhotoPanel (FLT-06).
 *
 * Reuses the Phase 1 documents upload flow (signed URL → PUT → finalize).
 * The aircraft detail page server-renders the list of aircraft_photo
 * documents separately; here we only handle the upload orchestration.
 */
export function PhotoPanel({ aircraftId }: { aircraftId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const getUrl = trpc.documents.uploadAircraftPhoto.useMutation();
  const finalize = trpc.documents.finalizeUpload.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const form = e.currentTarget;
    const file = (new FormData(form).get('file') as File | null) ?? null;
    if (!file || file.size === 0) {
      setError('Choose a file');
      return;
    }
    if (file.size > MAX_BYTE_SIZE) {
      setError('File too large');
      return;
    }
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('Only JPEG / PNG / PDF allowed');
      return;
    }
    setBusy(true);
    try {
      const signed = await getUrl.mutateAsync({
        aircraftId,
        mimeType: file.type as (typeof ALLOWED_MIME_TYPES)[number],
        byteSize: file.size,
      });
      const put = await fetch(signed.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await finalize.mutateAsync({
        documentId: signed.documentId,
        kind: 'aircraft_photo',
        path: signed.path,
        mimeType: file.type as (typeof ALLOWED_MIME_TYPES)[number],
        byteSize: file.size,
      });
      form.reset();
      setOk(true);
      router.refresh();
      setTimeout(() => setOk(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={s.section}>
      <h2 style={s.heading}>Photo</h2>

      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          marginTop: '0.85rem',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,application/pdf"
          disabled={busy}
          required
          style={{
            ...s.input,
            padding: '0.35rem 0.5rem',
            height: 'auto',
            cursor: 'pointer',
            flex: '1 1 260px',
          }}
        />
        <button type="submit" style={s.primaryButton} disabled={busy}>
          {busy ? 'Uploading…' : 'Upload photo'}
        </button>
        {error ? <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</span> : null}
        {ok ? <span style={{ color: '#4ade80', fontSize: '0.82rem' }}>Uploaded.</span> : null}
      </form>
    </section>
  );
}
