import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import type { ReactNode } from 'react';
import { db, users, userRoles, userBase, bases, schools } from '@part61/db';
import type { Role } from '@part61/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { BaseSwitcher } from '@/components/BaseSwitcher';
import { LogoutButton } from '@/components/LogoutButton';
import { NotificationBell } from '@/components/NotificationBell';
import { MessagingToggleButton } from '@/components/MessagingDrawer';
import { BroadcastBanner } from '@/components/BroadcastBanner';
import { AppShellProviders } from '@/components/AppShellProviders';
import { RoleSubNav } from '@/components/RoleSubNav';

const ROLES: readonly Role[] = ['student', 'instructor', 'mechanic', 'admin'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x);
}
function isUuid(x: unknown): x is string {
  return typeof x === 'string' && UUID_RE.test(x);
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const shadowRows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const shadow = shadowRows[0];
  if (!shadow) redirect('/login');

  const roleRows = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  const rolesList: Role[] = roleRows.map((r) => r.role as Role).filter(isRole);
  if (rolesList.length === 0) redirect('/login');

  const cookieStore = await cookies();
  const cookieRole = cookieStore.get('part61.active_role')?.value;
  let activeRole: Role | undefined;
  if (isRole(cookieRole) && rolesList.includes(cookieRole)) {
    activeRole = cookieRole;
  } else {
    const def = roleRows.find((r) => r.isDefault)?.role;
    if (isRole(def)) activeRole = def;
  }
  if (!activeRole) activeRole = rolesList[0]!;

  const schoolRows = await db
    .select()
    .from(schools)
    .where(eq(schools.id, shadow.schoolId))
    .limit(1);
  const schoolName = schoolRows[0]?.name ?? 'Part 61 School';
  const schoolIconUrl = schoolRows[0]?.iconUrl ?? null;
  // Home-base label priority:
  //   1. Resolved airport NAME stored on the school row (migration 0042)
  //   2. The raw identifier the admin entered (e.g. 'KBHM')
  //   3. The legacy user_base row name ('Home Base') — set below
  // Picked in JSX by falling back onto activeBaseName when both school
  // fields are empty.
  const schoolHomeBaseAirportName = schoolRows[0]?.homeBaseAirportName?.trim() || null;
  const schoolHomeBaseAirport = schoolRows[0]?.homeBaseAirport?.trim() || null;

  // MUL-02: resolve the active base for this user. Cookie first (when
  // valid and the user actually has a user_base row for it), then the
  // user's first user_base row. BaseSwitcher (Plan 04) will write the
  // cookie; Phase 2 just reads and passes baseId through to tRPC via
  // the session.
  const cookieBaseRaw = cookieStore.get('part61.active_base_id')?.value;
  let activeBaseId: string | null = null;
  if (isUuid(cookieBaseRaw)) {
    const match = await db
      .select({ baseId: userBase.baseId })
      .from(userBase)
      .where(and(eq(userBase.userId, user.id), eq(userBase.baseId, cookieBaseRaw)))
      .limit(1);
    if (match[0]) activeBaseId = match[0].baseId;
  }
  if (!activeBaseId) {
    const first = await db
      .select({ baseId: userBase.baseId })
      .from(userBase)
      .where(eq(userBase.userId, user.id))
      .limit(1);
    if (first[0]) activeBaseId = first[0].baseId;
  }
  let activeBaseName: string | null = null;
  if (activeBaseId) {
    const baseRows = await db
      .select({ name: bases.name })
      .from(bases)
      .where(eq(bases.id, activeBaseId))
      .limit(1);
    activeBaseName = baseRows[0]?.name ?? null;
  }

  // List all bases this user has access to, for BaseSwitcher.
  const availableBases = await db
    .select({ id: bases.id, name: bases.name })
    .from(userBase)
    .innerJoin(bases, eq(bases.id, userBase.baseId))
    .where(eq(userBase.userId, user.id));

  const roleColorMap: Record<string, string> = {
    admin: '#f97316',
    instructor: '#38bdf8',
    student: '#34d399',
    mechanic: '#a78bfa',
    rental_customer: '#7a869a',
  };
  const roleHue = roleColorMap[activeRole] ?? '#7a869a';
  const roleCallsign: Record<string, string> = {
    admin: 'OPS',
    instructor: 'CFI',
    student: 'STU',
    mechanic: 'MX',
    rental_customer: 'REN',
  };

  return (
    <AppShellProviders userId={user.id} schoolId={shadow.schoolId}>
      <div
        className="tfs-app"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          background:
            'radial-gradient(ellipse 120% 40% at 50% 0%, rgba(56, 189, 248, 0.06) 0%, transparent 55%), #05070e',
          color: 'var(--fg, #f7f9fc)',
        }}
      >
        <BroadcastBanner />
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle, #1a2238)',
            background: 'rgba(13, 18, 32, 0.85)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            flexShrink: 0,
            gap: '1.25rem',
            position: 'sticky',
            top: 0,
            zIndex: 20,
          }}
        >
          {/* Brand — links back to role-appropriate dashboard */}
          <Link
            href="/"
            aria-label="Go to dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              paddingRight: '1rem',
              borderRight: '1px solid var(--border-subtle, #1a2238)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            {/* Brand pill = PRODUCT branding, not tenant branding.
                Diamond glyph on the LEFT of the product name 'Part 61
                School'. The tenant's school name + uploaded icon live
                in the user pill further to the right. */}
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                width: 28,
                height: 28,
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                color: '#0a0e1a',
                borderRadius: 6,
                fontWeight: 800,
                fontSize: '0.72rem',
                letterSpacing: '-0.03em',
                boxShadow: '0 0 12px rgba(251, 191, 36, 0.3)',
              }}
            >
              ◆
            </span>
            <span
              style={{
                fontSize: '0.96rem',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: '#f7f9fc',
              }}
            >
              Flight School Platform
            </span>
          </Link>

          {/* User pill — role callsign */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.3rem 0.7rem 0.3rem 0.35rem',
              background: 'rgba(18, 24, 38, 0.6)',
              border: `1px solid ${roleHue}33`,
              borderRadius: 999,
              fontSize: '0.8rem',
            }}
          >
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: roleHue,
                background: `${roleHue}22`,
                padding: '0.15rem 0.45rem',
                borderRadius: 999,
                minWidth: 32,
                textAlign: 'center',
              }}
            >
              {roleCallsign[activeRole] ?? activeRole.toUpperCase().slice(0, 3)}
            </span>
            <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>{shadow.email}</span>
            {/* Home-base label. Prefer the resolved airport NAME from
                schools.home_base_airport_name (migration 0042), fall
                back to the admin-entered code in schools.home_base_airport,
                then the legacy user_base name. The school icon lives
                next to the school name in the brand pill at the left —
                not here. */}
            {/* Home base airport NAME (not ICAO). Prefers the resolved
                name from schools.home_base_airport_name, falls back to
                the raw identifier, then to the legacy user_base name. */}
            {(schoolHomeBaseAirportName ?? schoolHomeBaseAirport ?? activeBaseName) ? (
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#cbd5e1',
                  paddingLeft: '0.5rem',
                  borderLeft: '1px solid #1f2940',
                  marginLeft: '0.1rem',
                }}
              >
                {schoolHomeBaseAirportName ?? schoolHomeBaseAirport ?? activeBaseName}
              </span>
            ) : null}
            {/* School name + icon — the TENANT's identity (the specific
                flight school this deploy is serving), separate from the
                product branding in the brand pill. Rendered right after
                the home-base airport so the pill reads
                  OPS · email · <airport name> · <school name> · <icon> */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                paddingLeft: '0.5rem',
                borderLeft: '1px solid #1f2940',
                marginLeft: '0.1rem',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600 }}>
                {schoolName}
              </span>
              {schoolIconUrl ? (
                <img
                  src={schoolIconUrl}
                  alt=""
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    objectFit: 'contain',
                    background: '#0a0e1a',
                    boxShadow: '0 0 8px rgba(251, 191, 36, 0.2)',
                  }}
                />
              ) : null}
            </span>
          </div>

          {/* Spacer — navigation now lives entirely in the role sub-nav below */}
          <div style={{ flex: 1 }} />

          {/* Right controls */}
          <div
            style={{
              display: 'inline-flex',
              gap: '0.5rem',
              alignItems: 'center',
              paddingLeft: '0.75rem',
              borderLeft: '1px solid #1a2238',
            }}
          >
            <NotificationBell />
            <MessagingToggleButton />
            <BaseSwitcher availableBases={availableBases} activeBaseId={activeBaseId} />
            {rolesList.length > 1 ? <RoleSwitcher roles={rolesList} active={activeRole} /> : null}
            <LogoutButton />
          </div>
        </header>

        {/* Role sub-nav — one unified component renders a themed dropdown
            sub-header for every role (admin / instructor / student /
            mechanic / rental_customer). The per-role config trims the
            groups and links to what each role's RLS + route guards
            actually allow. */}
        <RoleSubNav role={activeRole} />

        <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </AppShellProviders>
  );
}
