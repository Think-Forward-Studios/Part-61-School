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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          padding: '1rem',
          borderBottom: '1px solid #ccc',
          flexShrink: 0,
        }}
      >
        <strong>{schoolName}</strong>
        <span>
          Signed in as {shadow.email} — active role: {activeRole}
          {activeBaseName ? ` — base: ${activeBaseName}` : ''}
        </span>
        <a href="/record" style={{ fontSize: '0.85rem' }}>
          My Record
        </a>
        <a href="/flight-log" style={{ fontSize: '0.85rem' }}>
          Flight Log
        </a>
        <a href="/fleet-map" style={{ fontSize: '0.85rem' }}>
          Fleet Map
        </a>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '1rem' }}>
          <BaseSwitcher availableBases={availableBases} activeBaseId={activeBaseId} />
          {rolesList.length > 1 ? <RoleSwitcher roles={rolesList} active={activeRole} /> : null}
        </span>
        <LogoutButton />
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  );
}
