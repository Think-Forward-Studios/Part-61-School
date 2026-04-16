import { NextResponse, type NextRequest } from 'next/server';

const GATE_COOKIE = 'tfs_gate';
const GATE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Handles both JSON-fetch flow (Chrome/modern) AND standard HTML form
 * POST flow (Safari-friendly — avoids ITP cookie rejection on fetch).
 *
 * Form POST flow: returns a 303 redirect to ?next= URL with the cookie
 * set on the redirect response. Safari accepts this without ITP issues.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.GATE_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: 'Gate not configured' }, { status: 500 });
  }

  const contentType = request.headers.get('content-type') || '';
  const isFormPost = contentType.includes('application/x-www-form-urlencoded');

  let password: string | undefined;
  let next = '/';

  if (isFormPost) {
    const form = await request.formData();
    password = String(form.get('password') ?? '');
    next = String(form.get('next') ?? '/');
  } else {
    try {
      const body = (await request.json()) as { password?: string; next?: string };
      password = body.password;
      next = body.next ?? '/';
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
  }

  if (password !== expected) {
    if (isFormPost) {
      const url = new URL('/gate', request.url);
      url.searchParams.set('next', next);
      url.searchParams.set('error', '1');
      return NextResponse.redirect(url, { status: 303 });
    }
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  // Build response: redirect for form POST, JSON for fetch
  const response = isFormPost
    ? NextResponse.redirect(new URL(next || '/', request.url), { status: 303 })
    : NextResponse.json({ ok: true });

  response.cookies.set(GATE_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: GATE_MAX_AGE,
    path: '/',
  });
  return response;
}
