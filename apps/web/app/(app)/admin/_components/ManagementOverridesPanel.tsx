/**
 * ManagementOverridesPanel — server component for admin dashboard (IPF-06).
 *
 * Renders recent management overrides (last 30 days) via a direct SQL query.
 * Links each row to the student profile for drill-down.
 */
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@part61/db';
import { overrideKindLabel } from '@part61/domain';

type OverrideRow = {
  id: string;
  student_enrollment_id: string;
  student_user_id: string;
  student_name: string | null;
  lesson_title: string | null;
  kind: string;
  granted_by_name: string | null;
  granted_at: string;
  status: string;
};

function resolveStatus(row: {
  consumed_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
}): string {
  if (row.revoked_at) return 'revoked';
  if (row.consumed_at) return 'consumed';
  if (row.expires_at && new Date(row.expires_at) < new Date()) return 'expired';
  return 'active';
}

function statusBadge(status: string): { bg: string; fg: string } {
  if (status === 'active') return { bg: '#dcfce7', fg: '#166534' };
  if (status === 'consumed') return { bg: '#dbeafe', fg: '#1e40af' };
  if (status === 'revoked') return { bg: '#fee2e2', fg: '#991b1b' };
  if (status === 'expired') return { bg: '#f3f4f6', fg: '#6b7280' };
  return { bg: '#f3f4f6', fg: '#374151' };
}

export async function ManagementOverridesPanel({ schoolId }: { schoolId: string }) {
  const rows = (await db.execute(sql`
    select
      lo.id,
      lo.student_enrollment_id,
      sce.user_id as student_user_id,
      stu.full_name as student_name,
      l.title as lesson_title,
      lo.kind::text as kind,
      granter.full_name as granted_by_name,
      lo.granted_at::text as granted_at,
      lo.consumed_at::text as consumed_at,
      lo.revoked_at::text as revoked_at,
      lo.expires_at::text as expires_at
    from public.lesson_override lo
    left join public.student_course_enrollment sce on sce.id = lo.student_enrollment_id
    left join public.users stu on stu.id = sce.user_id
    left join public.lesson l on l.id = lo.lesson_id
    left join public.users granter on granter.id = lo.granted_by_user_id
    where lo.school_id = ${schoolId}::uuid
      and lo.granted_at >= now() - interval '30 days'
    order by lo.granted_at desc
    limit 50
  `)) as unknown as Array<Record<string, string | null>>;

  const overrides: OverrideRow[] = rows.map((r) => ({
    id: r.id ?? '',
    student_enrollment_id: r.student_enrollment_id ?? '',
    student_user_id: r.student_user_id ?? '',
    student_name: r.student_name ?? null,
    lesson_title: r.lesson_title ?? null,
    kind: r.kind ?? '',
    granted_by_name: r.granted_by_name ?? null,
    granted_at: r.granted_at ?? '',
    status: resolveStatus({
      consumed_at: r.consumed_at ?? null,
      revoked_at: r.revoked_at ?? null,
      expires_at: r.expires_at ?? null,
    }),
  }));

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Recent management overrides</h2>
        <Link href="/admin/overrides" style={{ fontSize: '0.85rem' }}>
          View all
        </Link>
      </div>
      {overrides.length === 0 ? (
        <p style={{ color: '#888', marginTop: '0.5rem' }}>
          No management overrides in the last 30 days.
        </p>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: '0.4rem' }}>Student</th>
              <th style={{ padding: '0.4rem' }}>Lesson</th>
              <th style={{ padding: '0.4rem' }}>Kind</th>
              <th style={{ padding: '0.4rem' }}>Granted by</th>
              <th style={{ padding: '0.4rem' }}>Granted at</th>
              <th style={{ padding: '0.4rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => {
              const badge = statusBadge(o.status);
              return (
                <tr key={o.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    {o.student_user_id ? (
                      <Link href={`/admin/people/${o.student_user_id}`}>
                        {o.student_name ?? 'Unknown'}
                      </Link>
                    ) : (
                      o.student_name ?? 'Unknown'
                    )}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{o.lesson_title ?? '--'}</td>
                  <td style={{ padding: '0.4rem' }}>{overrideKindLabel(o.kind)}</td>
                  <td style={{ padding: '0.4rem' }}>{o.granted_by_name ?? '--'}</td>
                  <td style={{ padding: '0.4rem' }}>
                    {o.granted_at ? new Date(o.granted_at).toLocaleDateString() : '--'}
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.fg,
                        padding: '0.1rem 0.4rem',
                        borderRadius: 3,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
