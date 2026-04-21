'use client';
/**
 * DocumentsPanel — client container for /profile/documents.
 *
 * Holds target-user state so admins can switch who the list + upload
 * operate on. Students / instructors / mechanics always operate on
 * themselves (the picker renders as a static label for them).
 *
 * Data flow:
 *   - admin.people.list — only queried when activeRole === 'admin',
 *     populates the target picker.
 *   - documents.list ({ forUserId }) — refetches whenever target
 *     changes.
 *   - UploadForm calls documents.createSignedUploadUrl +
 *     documents.finalizeUpload with { forUserId: target } so the
 *     storage path and inserted row are scoped to the target.
 */
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { UploadForm } from './UploadForm';
import { DocumentList } from './DocumentList';

export function DocumentsPanel({
  currentUserId,
  isAdmin,
}: {
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [targetUserId, setTargetUserId] = useState<string>(currentUserId);
  const isSelf = targetUserId === currentUserId;

  // Only admins get the full roster. Non-admins operate solely on self.
  const peopleQ = trpc.admin.people.list.useQuery({ limit: 500, offset: 0 }, { enabled: isAdmin });

  // Document list for whichever user is targeted.
  const docsQ = trpc.documents.list.useQuery(isSelf ? undefined : { forUserId: targetUserId });

  const targetLabel = useMemo(() => {
    if (isSelf) return 'Myself';
    const people = (peopleQ.data?.rows ?? []) as Array<Record<string, unknown>>;
    const match = people.find((p) => p.id === targetUserId);
    if (!match) return targetUserId;
    const first = (match.first_name as string | null) ?? '';
    const last = (match.last_name as string | null) ?? '';
    const name = [first, last].filter(Boolean).join(' ').trim();
    return name || (match.email as string) || targetUserId;
  }, [isSelf, peopleQ.data, targetUserId]);

  const documents = (docsQ.data ?? []).map((d) => ({
    id: d.id,
    kind: d.kind,
    storagePath: d.storagePath,
    mimeType: d.mimeType,
    byteSize: d.byteSize,
    expiresAt: d.expiresAt instanceof Date ? d.expiresAt.toISOString() : (d.expiresAt ?? null),
    uploadedAt: d.uploadedAt instanceof Date ? d.uploadedAt.toISOString() : String(d.uploadedAt),
  }));

  return (
    <>
      {isAdmin ? (
        <section
          style={{
            marginTop: '0.5rem',
            padding: '1rem 1.1rem',
            background: 'rgba(249, 115, 22, 0.06)',
            border: '1px solid rgba(249, 115, 22, 0.25)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: '0.8rem',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: '0.62rem',
              letterSpacing: '0.18em',
              color: '#f97316',
              textTransform: 'uppercase',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            ◆ Admin · Upload target
          </span>
          <select
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            style={{
              padding: '0.45rem 0.7rem',
              background: '#05070e',
              border: '1px solid #1a2238',
              borderRadius: 6,
              color: '#f7f9fc',
              fontSize: '0.85rem',
              minWidth: 280,
              flex: 1,
              fontFamily: 'inherit',
            }}
          >
            <option value={currentUserId}>Myself</option>
            {peopleQ.isLoading ? <option disabled>Loading people…</option> : null}
            {((peopleQ.data?.rows ?? []) as Array<Record<string, unknown>>)
              .filter((p) => p.id !== currentUserId)
              .map((p) => {
                const id = p.id as string;
                const first = (p.first_name as string | null) ?? '';
                const last = (p.last_name as string | null) ?? '';
                const name = [first, last].filter(Boolean).join(' ').trim();
                const email = p.email as string;
                const label = name ? `${name} · ${email}` : email;
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                );
              })}
          </select>
          {!isSelf ? (
            <button
              type="button"
              onClick={() => setTargetUserId(currentUserId)}
              style={{
                padding: '0.4rem 0.9rem',
                background: 'transparent',
                color: '#7a869a',
                border: '1px solid #1f2940',
                borderRadius: 6,
                fontSize: '0.68rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ← Back to myself
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Context line when operating on someone else */}
      {!isSelf ? (
        <p
          style={{
            marginTop: '0.9rem',
            color: '#fbbf24',
            fontSize: '0.82rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.05em',
          }}
        >
          ⚠ Uploading / viewing documents for <strong>{targetLabel}</strong>
        </p>
      ) : null}

      <UploadForm
        targetUserId={isSelf ? undefined : targetUserId}
        onUploaded={() => {
          void docsQ.refetch();
        }}
      />

      <DocumentList
        documents={documents}
        isLoading={docsQ.isLoading}
        targetLabel={isSelf ? null : targetLabel}
        onMutated={() => {
          void docsQ.refetch();
        }}
      />
    </>
  );
}
