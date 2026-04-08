import { and, desc, eq, isNull } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
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
import { EditProfileForm } from './EditProfileForm';
import { HoldsPanel } from './HoldsPanel';
import { CurrenciesPanel } from './CurrenciesPanel';
import { QualificationsPanel } from './QualificationsPanel';
import { EmergencyContactsPanel } from './EmergencyContactsPanel';
import { InfoReleasePanel } from './InfoReleasePanel';
import { ExperiencePanel } from './ExperiencePanel';
import { RolesPanel } from './RolesPanel';

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

  const contacts = await db
    .select()
    .from(emergencyContact)
    .where(eq(emergencyContact.userId, id));

  const releases = await db
    .select()
    .from(infoReleaseAuthorization)
    .where(and(eq(infoReleaseAuthorization.userId, id), isNull(infoReleaseAuthorization.revokedAt)));

  const experience = await db
    .select()
    .from(instructorExperience)
    .where(eq(instructorExperience.userId, id))
    .orderBy(desc(instructorExperience.asOfDate));

  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, id));

  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || targetUser.email;

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <h1>{displayName}</h1>
      <p style={{ color: '#555' }}>
        {targetUser.email} · status: {targetUser.status}
      </p>

      {activeHold ? (
        <div
          style={{
            background: '#ffe6e6',
            border: '2px solid #c00',
            borderRadius: 6,
            padding: '1rem',
            margin: '1rem 0',
          }}
        >
          <strong style={{ color: '#c00' }}>
            Active {activeHold.kind === 'grounding' ? 'GROUNDING' : 'HOLD'}
          </strong>
          <div>Reason: {activeHold.reason}</div>
          <div style={{ fontSize: '0.85rem', color: '#555' }}>
            Placed by {activeHold.createdBy} on{' '}
            {new Date(activeHold.createdAt).toLocaleString()}
          </div>
        </div>
      ) : null}

      <EditProfileForm
        userId={id}
        initial={{
          email: targetUser.email,
          firstName: profile?.firstName ?? '',
          lastName: profile?.lastName ?? '',
          phone: profile?.phone ?? '',
          notes: profile?.notes ?? '',
        }}
      />

      <RolesPanel userId={id} roles={roles.map((r) => ({ role: r.role, mechanicAuthority: r.mechanicAuthority }))} />
      <HoldsPanel userId={id} holds={holds.map(serialize)} />
      <CurrenciesPanel userId={id} currencies={currencies.map(serialize)} />
      <QualificationsPanel userId={id} quals={quals.map(serialize)} />
      <EmergencyContactsPanel userId={id} contacts={contacts.map(serialize)} />
      <InfoReleasePanel userId={id} releases={releases.map(serialize)} />
      <ExperiencePanel userId={id} experience={experience.map(serialize)} />
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
