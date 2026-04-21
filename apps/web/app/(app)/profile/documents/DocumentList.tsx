'use client';

/**
 * DocumentList — renders a document list with per-row Download + Delete.
 *
 * Data comes from the parent (which queries trpc.documents.list);
 * after mutations the parent's onMutated() refetches. targetLabel
 * appears in the heading when an admin is viewing someone else's
 * documents so the context stays obvious.
 */
import { useState } from 'react';
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
  aircraft_photo: 'Aircraft Photo',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};

const CHIP_SKY: React.CSSProperties = {
  display: 'inline-flex',
  padding: '0.3rem 0.7rem',
  background: 'rgba(56, 189, 248, 0.12)',
  color: '#38bdf8',
  border: '1px solid rgba(56, 189, 248, 0.3)',
  borderRadius: 6,
  fontSize: '0.68rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const CHIP_ROSE: React.CSSProperties = {
  ...CHIP_SKY,
  background: 'transparent',
  color: '#f87171',
  borderColor: 'rgba(248, 113, 113, 0.35)',
};

export function DocumentList({
  documents,
  isLoading,
  targetLabel,
  onMutated,
}: {
  documents: DocumentRow[];
  isLoading?: boolean;
  /** When admin is viewing someone else's docs, their name/email. */
  targetLabel?: string | null;
  onMutated?: () => void;
}) {
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
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setPendingId(null);
    }
  }

  const heading = targetLabel ? `On file for ${targetLabel}` : 'On file';

  return (
    <section style={{ marginTop: '1.25rem' }}>
      <h2
        style={{
          margin: '0 0 0.6rem',
          fontSize: '0.72rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          color: '#7a869a',
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          fontWeight: 500,
        }}
      >
        {heading}
      </h2>
      {error ? (
        <p style={{ color: '#f87171', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>{error}</p>
      ) : null}
      {isLoading ? (
        <div
          style={{
            padding: '2rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.85rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          Loading documents…
        </div>
      ) : documents.length === 0 ? (
        <div
          style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No documents yet.
        </div>
      ) : (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>Type</th>
                <th style={TH}>Uploaded</th>
                <th style={TH}>Expires</th>
                <th style={{ ...TH, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const disabled = pendingId === doc.id;
                return (
                  <tr key={doc.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={{ ...TD, color: '#f7f9fc', fontWeight: 500 }}>
                      {KIND_LABEL[doc.kind]}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                      }}
                    >
                      {formatDate(doc.uploadedAt)}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                      }}
                    >
                      {doc.expiresAt ? (
                        formatDate(doc.expiresAt)
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDownload(doc.id)}
                          style={{
                            ...CHIP_SKY,
                            opacity: disabled ? 0.5 : 1,
                            cursor: disabled ? 'wait' : 'pointer',
                          }}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDelete(doc.id)}
                          style={{
                            ...CHIP_ROSE,
                            opacity: disabled ? 0.5 : 1,
                            cursor: disabled ? 'wait' : 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
