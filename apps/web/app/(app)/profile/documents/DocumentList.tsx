'use client';

/**
 * DocumentList — renders the caller's documents and the per-row
 * Download + Delete actions. Initial data comes from the Server
 * Component; after mutations we call router.refresh() to re-render
 * the server tree (no client-side cache to invalidate).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DocumentKind } from '@part61/domain';
import { trpc } from '@/lib/trpc/client';

export interface DocumentRow {
  id: string;
  kind: DocumentKind;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  expiresAt: string | null;
  uploadedAt: string;
}

const KIND_LABEL: Record<DocumentKind, string> = {
  medical: 'Medical',
  pilot_license: 'Pilot License',
  government_id: 'Government ID',
  insurance: 'Insurance',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function DocumentList({ initialDocuments }: { initialDocuments: DocumentRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getDownloadUrl = trpc.documents.createSignedDownloadUrl.useMutation();
  const softDelete = trpc.documents.softDelete.useMutation();

  async function onDownload(id: string) {
    setError(null);
    setPendingId(id);
    try {
      const { url } = await getDownloadUrl.mutateAsync({ documentId: id });
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setPendingId(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this document? This cannot be undone from the UI.')) return;
    setError(null);
    setPendingId(id);
    try {
      await softDelete.mutateAsync({ documentId: id });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setPendingId(null);
    }
  }

  if (initialDocuments.length === 0) {
    return <p style={{ marginTop: '1rem' }}>No documents yet.</p>;
  }

  return (
    <section style={{ marginTop: '1rem' }}>
      <h2>On file</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {initialDocuments.map((doc) => (
          <li
            key={doc.id}
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              padding: '0.5rem 0',
              borderBottom: '1px solid #eee',
            }}
          >
            <div style={{ flex: 1 }}>
              <strong>{KIND_LABEL[doc.kind]}</strong>
              <div style={{ fontSize: '0.85rem', color: '#555' }}>
                Uploaded {formatDate(doc.uploadedAt)}
                {doc.expiresAt ? ` · Expires ${formatDate(doc.expiresAt)}` : ''}
              </div>
            </div>
            <button
              type="button"
              disabled={pendingId === doc.id}
              onClick={() => onDownload(doc.id)}
            >
              Download
            </button>
            <button type="button" disabled={pendingId === doc.id} onClick={() => onDelete(doc.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
