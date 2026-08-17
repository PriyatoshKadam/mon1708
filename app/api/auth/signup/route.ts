import { NextRequest, NextResponse } from 'next/server';
import { createUser, createSession, findUserByEmail } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'Account already exists — try logging in' }, { status: 400 });
    }

    const userId = await createUser(email, password, name);
    await createSession(userId, email);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Signup failed' }, { status: 500 });
  }
}
