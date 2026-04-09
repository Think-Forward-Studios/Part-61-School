'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface LineItemRow {
  id: string;
  position: number;
  code: string;
  title: string;
  description: string | null;
  classification: string;
}

interface Props {
  versionId: string;
  lessonId: string;
  canEdit: boolean;
  initialLineItems: LineItemRow[];
}

export function LessonEditor({ versionId, lessonId, canEdit, initialLineItems }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const addLineItem = trpc.admin.courses.addLineItem.useMutation();
  const updateLineItem = trpc.admin.courses.updateLineItem.useMutation();

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await addLineItem.mutateAsync({
        versionId,
        lessonId,
        position: initialLineItems.length,
        code: String(fd.get('code') ?? '').trim(),
        title: String(fd.get('title') ?? '').trim(),
        description: (fd.get('description') as string) || undefined,
        classification: (fd.get('classification') as 'required' | 'optional' | 'must_pass') ?? 'required',
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    }
  }

  async function onReclassify(lineItemId: string, classification: 'required' | 'optional' | 'must_pass') {
    try {
      await updateLineItem.mutateAsync({ versionId, lineItemId, classification });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2>Line items</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {initialLineItems.length === 0 ? (
        <p style={{ color: '#888' }}>No line items yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '0.35rem' }}>#</th>
              <th style={{ padding: '0.35rem' }}>Code</th>
              <th style={{ padding: '0.35rem' }}>Title</th>
              <th style={{ padding: '0.35rem' }}>Classification</th>
            </tr>
          </thead>
          <tbody>
            {initialLineItems.map((li) => (
              <tr key={li.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.35rem' }}>{li.position + 1}</td>
                <td style={{ padding: '0.35rem', fontFamily: 'monospace' }}>{li.code}</td>
                <td style={{ padding: '0.35rem' }}>{li.title}</td>
                <td style={{ padding: '0.35rem' }}>
                  {canEdit ? (
                    <select
                      defaultValue={li.classification}
                      onChange={(e) =>
                        onReclassify(
                          li.id,
                          e.target.value as 'required' | 'optional' | 'must_pass',
                        )
                      }
                    >
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                      <option value="must_pass">Must Pass</option>
                    </select>
                  ) : (
                    <span>{li.classification.replace('_', ' ')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit ? (
        <form
          onSubmit={onAdd}
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxWidth: 520,
          }}
        >
          <strong style={{ fontSize: '0.85rem' }}>Add line item</strong>
          <input name="code" placeholder="Code (e.g. 1a)" required />
          <input name="title" placeholder="Title" required />
          <input name="description" placeholder="Description (optional)" />
          <select name="classification" defaultValue="required">
            <option value="required">Required</option>
            <option value="optional">Optional</option>
            <option value="must_pass">Must Pass</option>
          </select>
          <button type="submit" disabled={addLineItem.isPending}>
            {addLineItem.isPending ? 'Adding…' : 'Add line item'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
