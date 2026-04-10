/**
 * StudentRolloverQueuePanel — rollover line items for students (SYL-15).
 *
 * Server component that receives rollover data as props (fetched via
 * server-side SQL in the page). Encouragement-first copy:
 * "Items to re-attempt in your next lesson".
 *
 * No admin controls, no refresh button.
 */

type RolloverRow = {
  line_item_grade_id: string;
  source_lesson_title: string;
  source_sealed_at: string | null;
  target_lesson_title: string;
  line_item_objective: string | null;
  line_item_classification: string;
};

function classificationBadge(cls: string): { bg: string; label: string } {
  if (cls === 'must_pass') return { bg: '#dc2626', label: 'Must pass' };
  if (cls === 'required') return { bg: '#d97706', label: 'Required' };
  return { bg: '#6b7280', label: cls.replace(/_/g, ' ') };
}

export function StudentRolloverQueuePanel({ rows }: { rows: RolloverRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section style={{ marginTop: '1rem' }}>
      <h2 style={{ fontSize: '1rem' }}>
        Items to re-attempt in your next lesson ({rows.length})
      </h2>
      <p style={{ color: '#555', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        These items were not yet satisfactory and will appear in your next grade sheet.
        Your instructor will review them with you.
      </p>
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
              </div>
              {r.line_item_objective ? (
                <div style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                  {r.line_item_objective}
                </div>
              ) : null}
              <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                Will be reviewed in: {r.target_lesson_title}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
