'use client';

/**
 * RolloverQueuePanel — outstanding rollover line items (SYL-15).
 *
 * Consumes admin.enrollments.listRolloverQueue({ enrollmentId }) as defined
 * in plan 06-02. Renders each rollover row with source lesson, sealed date,
 * line item objective, classification badge, and target lesson label.
 */

import { trpc } from '@/lib/trpc/client';

type RolloverRow = {
  line_item_grade_id: string;
  source_grade_sheet_id: string;
  source_sealed_at: string | null;
  source_lesson_id: string;
  source_lesson_title: string;
  target_grade_sheet_id: string;
  target_lesson_id: string;
  target_lesson_title: string;
  line_item_id: string;
  line_item_objective: string | null;
  line_item_classification: string;
};

function classificationBadge(cls: string): { bg: string; label: string } {
  if (cls === 'must_pass') return { bg: '#dc2626', label: 'Must pass' };
  if (cls === 'required') return { bg: '#d97706', label: 'Required' };
  return { bg: '#6b7280', label: cls.replace(/_/g, ' ') };
}

function fmtDate(val: string | null): string {
  if (!val) return '--';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function RolloverQueuePanel({ enrollmentId }: { enrollmentId: string }) {
  const query = trpc.admin.enrollments.listRolloverQueue.useQuery({ enrollmentId });

  if (query.isLoading) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Rollover queue</h2>
        <p style={{ color: '#888' }}>Loading rollover items...</p>
      </section>
    );
  }

  const rows = (query.data ?? []) as unknown as RolloverRow[];

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem' }}>Rollover queue</h2>
      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>No outstanding rollover items.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rows.map((r) => {
            const badge = classificationBadge(r.line_item_classification);
            return (
              <li
                key={r.line_item_grade_id}
                style={{
                  padding: '0.5rem 0',
                  borderBottom: '1px solid #eee',
                  fontSize: '0.9rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      background: badge.bg,
                      color: 'white',
                      padding: '0.1rem 0.4rem',
                      borderRadius: 3,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                    }}
                  >
                    {badge.label}
                  </span>
                  <strong>{r.source_lesson_title}</strong>
                  <span style={{ color: '#888', fontSize: '0.8rem' }}>
                    sealed {fmtDate(r.source_sealed_at)}
                  </span>
                </div>
                {r.line_item_objective ? (
                  <div style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                    {r.line_item_objective}
                  </div>
                ) : null}
                <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                  Rolled forward to Lesson {r.target_lesson_title}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
