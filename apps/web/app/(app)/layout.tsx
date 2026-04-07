import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import type { ReactNode } from 'react';
import { db, users, userRoles, schools } from '@part61/db';
import type { Role } from '@part61/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { LogoutButton } from '@/components/LogoutButton';

const ROLES: readonly Role[] = ['student', 'instructor', 'mechanic', 'admin'];
function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x);
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

  return (
    <div>
      <header
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          padding: '1rem',
          borderBottom: '1px solid #ccc',
        }}
      >
        <strong>{schoolName}</strong>
        <span>
          Signed in as {shadow.email} — active role: {activeRole}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          {rolesList.length > 1 ? <RoleSwitcher roles={rolesList} active={activeRole} /> : null}
        </span>
        <LogoutButton />
      </header>
      {children}
    </div>
  );
}
