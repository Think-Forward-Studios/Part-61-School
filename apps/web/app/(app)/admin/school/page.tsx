import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users, schools } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SchoolSettingsForm } from './SchoolSettingsForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SchoolSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  const rows = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  const school = rows[0];
  if (!school) redirect('/login');

  // Prefer the resolved full airport name (migration 0042); fall back
  // to the raw ICAO/ident if no name is on file.
  const airportDisplay =
    school.homeBaseAirportName?.trim() || school.homeBaseAirport?.trim() || null;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Administration"
        title="School Settings"
        subtitle={`${school.name} · ${school.timezone}`}
      />

      {/* Home-base + icon strip. The request was literally "display the
          icon on top of the page after the text 'home base'" — so the
          top of the school settings page gets a row with the airport
          label followed by the uploaded logo. This doubles as a live
          preview: whatever admins save here is what the top header
          pill and any future branding surface will render. */}
      <section
        style={{
          marginTop: '1.5rem',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem 1.25rem',
          background: 'rgba(18, 24, 38, 0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
        }}
      >
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.7rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#7a869a',
          }}
        >
          Home base
        </span>
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '1rem',
            letterSpacing: '0.08em',
            color: airportDisplay ? '#e2e8f0' : '#475569',
            fontWeight: 700,
          }}
        >
          {airportDisplay ?? '— not set —'}
        </span>
        {school.iconUrl ? (
          // Data URL is safe as <img src>. Using a native <img> skips
          // next/image's remote-loader dance for an admin-owned asset.
          <img
            src={school.iconUrl}
            alt={`${school.name} icon`}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              objectFit: 'contain',
              marginLeft: '0.5rem',
            }}
          />
        ) : null}
      </section>

      <SchoolSettingsForm
        initial={{
          name: school.name,
          timezone: school.timezone,
          homeBaseAirport: school.homeBaseAirport,
          homeBaseAirportName: school.homeBaseAirportName,
          iconUrl: school.iconUrl,
        }}
      />
    </main>
  );
}
