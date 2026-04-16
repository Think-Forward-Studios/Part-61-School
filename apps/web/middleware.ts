import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

const GATE_COOKIE = 'tfs_gate';
// Routes that should NOT be gated (the gate itself + its API)
const GATE_BYPASS = ['/gate', '/api/gate'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Gate password check — runs BEFORE Supabase auth so the public can't
  // even see the login page. Only enforced when GATE_PASSWORD is set.
  if (process.env.GATE_PASSWORD) {
    const isGateRoute = GATE_BYPASS.some(
      (p) => pathname === p || pathname.startsWith(p + '/'),
    );
    const hasGatePass = request.cookies.get(GATE_COOKIE)?.value === '1';

    if (!isGateRoute && !hasGatePass) {
      const url = request.nextUrl.clone();
      url.pathname = '/gate';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  // Supabase session refresh (existing behavior)
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
