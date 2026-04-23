import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import {
  db,
  users,
  personProfile,
  personHold,
  instructorCurrency,
  instructorQualification,
  emergencyContact,
  infoReleaseAuthorization,
  instructorExperience,
  userRoles,
} from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AdminActionsPanel } from './AdminActionsPanel';
import { EditProfileForm } from './EditProfileForm';
import { HoldsPanel } from './HoldsPanel';
import { CurrenciesPanel } from './CurrenciesPanel';
import { QualificationsPanel } from './QualificationsPanel';
import { EmergencyContactsPanel } from './EmergencyContactsPanel';
import { InfoReleasePanel } from './InfoReleasePanel';
import { ExperiencePanel } from './ExperiencePanel';
import { RolesPanel } from './RolesPanel';
import { StudentCurrenciesPanel } from './StudentCurrenciesPanel';
import { StudentEnrollmentsPanel } from './StudentEnrollmentsPanel';
import { TrainingRecordPanel } from './TrainingRecordPanel';
import { MinimumsStatusPanel } from './_panels/MinimumsStatusPanel';
import { ProgressForecastPanel } from './_panels/ProgressForecastPanel';
import { RolloverQueuePanel } from './_panels/RolloverQueuePanel';
import { NextActivityChip } from './_panels/NextActivityChip';
import { InstructorMetricsPanel } from './_components/InstructorMetricsPanel';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function PersonDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  const target = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.schoolId, schoolId)))
    .limit(1);
  const targetUser = target[0];
  if (!targetUser) notFound();

  const profile = (
    await db.select().from(personProfile).where(eq(personProfile.userId, id)).limit(1)
  )[0];

  const holds = await db
    .select()
    .from(personHold)
    .where(eq(personHold.userId, id))
    .orderBy(desc(personHold.createdAt));

  const activeHold = holds.find((h) => h.clearedAt == null);

  const currencies = await db
    .select()
    .from(instructorCurrency)
    .where(and(eq(instructorCurrency.userId, id), isNull(instructorCurrency.deletedAt)));

  const quals = await db
    .select()
    .from(instructorQualification)
    .where(and(eq(instructorQualification.userId, id), isNull(instructorQualification.revokedAt)));

  const contacts = await db.select().from(emergencyContact).where(eq(emergencyContact.userId, id));

  const releases = await db
    .select()
    .from(infoReleaseAuthorization)
    .where(
      and(eq(infoReleaseAuthorization.userId, id), isNull(infoReleaseAuthorization.revokedAt)),
    );

  const experience = await db
    .select()
    .from(instructorExperience)
    .where(eq(instructorExperience.userId, id))
    .orderBy(desc(instructorExperience.asOfDate));

  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, id));

  // Phase 6: resolve the student's active enrollments (most recent first).
  const activeEnrollments = (await db.execute(sql`
    select
      sce.id,
      sce.course_version_id,
      sce.enrolled_at,
      cv.version_label,
      c.code as course_code,
      c.title as course_title
    from public.student_course_enrollment sce
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course c on c.id = cv.course_id
    where sce.user_id = ${id}::uuid
      and sce.school_id = ${schoolId}::uuid
      and sce.deleted_at is null
      and sce.completed_at is null
      and sce.withdrawn_at is null
    order by sce.enrolled_at desc
  `)) as unknown as Array<{
    id: string;
    course_version_id: string | null;
    enrolled_at: string;
    version_label: string | null;
    course_code: string | null;
    course_title: string | null;
  }>;

  const primaryEnrollment = activeEnrollments[0] ?? null;

  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || targetUser.email;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <Link
          href="/admin/people"
          style={{
            color: '#7a869a',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.72rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          ← Directory
        </Link>
      </div>
      <PageHeader
        eyebrow="Directory"
        title={displayName}
        subtitle={
          <span
            style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: '0.78rem' }}
          >
            {targetUser.email} · status:{' '}
            <span style={{ color: '#f7f9fc' }}>{targetUser.status}</span>
          </span>
        }
      />

      {activeHold ? (
        <div
          style={{
            background: 'rgba(248, 113, 113, 0.08)',
            border: '1px solid rgba(248, 113, 113, 0.35)',
            borderRadius: 8,
            padding: '1rem 1.1rem',
            margin: '1rem 0',
          }}
        >
          <div
            style={{
              color: '#f87171',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '0.35rem',
            }}
          >
            ⚠ Active {activeHold.kind === 'grounding' ? 'grounding' : 'hold'}
          </div>
          <div style={{ color: '#f7f9fc', fontSize: '0.88rem' }}>Reason: {activeHold.reason}</div>
          <div style={{ fontSize: '0.78rem', color: '#7a869a', marginTop: '0.25rem' }}>
            Placed by {activeHold.createdBy} on {new Date(activeHold.createdAt).toLocaleString()}
          </div>
        </div>
      ) : null}

      <AdminActionsPanel
        userId={id}
        email={targetUser.email}
        status={targetUser.status as 'pending' | 'active' | 'inactive' | 'rejected'}
      />

      <EditProfileForm
        userId={id}
        initial={{
          email: targetUser.email,
          firstName: profile?.firstName ?? '',
          lastName: profile?.lastName ?? '',
          phone: profile?.phone ?? '',
          notes: profile?.notes ?? '',
          citizenshipStatus: profile?.citizenshipStatus ?? null,
          tsaAfspStatus: profile?.tsaAfspStatus ?? null,
        }}
      />

      <RolesPanel
        userId={id}
        roles={roles.map((r) => ({ role: r.role, mechanicAuthority: r.mechanicAuthority }))}
      />
      {roles.some((r) => r.role === 'instructor') && <InstructorMetricsPanel personId={id} />}
      <HoldsPanel userId={id} holds={holds.map(serialize)} />
      <CurrenciesPanel userId={id} currencies={currencies.map(serialize)} />
      <QualificationsPanel userId={id} quals={quals.map(serialize)} />
      <EmergencyContactsPanel userId={id} contacts={contacts.map(serialize)} />
      <InfoReleasePanel userId={id} releases={releases.map(serialize)} />
      <ExperiencePanel userId={id} experience={experience.map(serialize)} />
      {roles.some((r) => r.role === 'student') ? (
        <StudentEnrollmentsPanel
          userId={id}
          userDisplayName={
            [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
            targetUser.email
          }
        />
      ) : null}
      <StudentCurrenciesPanel studentUserId={id} />
      <TrainingRecordPanel studentUserId={id} schoolId={schoolId} />

      {primaryEnrollment ? (
        <section
          style={{ marginTop: '2rem', borderTop: '1px solid #1f2940', paddingTop: '1.25rem' }}
        >
          <h2
            style={{
              fontSize: '0.75rem',
              margin: '0 0 0.75rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              color: '#7a869a',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              fontWeight: 500,
            }}
          >
            Course progress
          </h2>
          {activeEnrollments.length > 1 ? (
            <p style={{ fontSize: '0.82rem', color: '#7a869a', margin: '0 0 0.75rem' }}>
              Student has {activeEnrollments.length} active enrollments. Showing:{' '}
              <span style={{ color: '#f7f9fc' }}>
                {primaryEnrollment.course_title ??
                  primaryEnrollment.course_code ??
                  'Untitled course'}
              </span>
              .{' '}
              <Link
                href={`/admin/enrollments?studentId=${id}`}
                style={{ color: '#38bdf8', textDecoration: 'none' }}
              >
                Open enrollments to view others
              </Link>
              .
            </p>
          ) : null}
          <MinimumsStatusPanel enrollmentId={primaryEnrollment.id} />
          <ProgressForecastPanel enrollmentId={primaryEnrollment.id} />
          <RolloverQueuePanel enrollmentId={primaryEnrollment.id} />
          <NextActivityChip enrollmentId={primaryEnrollment.id} studentId={id} />
        </section>
      ) : null}
    </main>
  );
}

// Serialize Drizzle rows (Dates etc.) for client component props.
// Returns `any` so callers can pass the serialized row into client
// components whose row types use string timestamps instead of Date.
function serialize<T extends Record<string, unknown>>(row: T): any {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}
