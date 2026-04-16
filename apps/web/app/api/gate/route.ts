import { NextResponse, type NextRequest } from 'next/server';

const GATE_COOKIE = 'tfs_gate';
const GATE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(request: NextRequest) {
  const expected = process.env.GATE_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: 'Gate not configured' }, { status: 500 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (body.password !== expected) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: GATE_MAX_AGE,
    path: '/',
  });
  return response;
}
