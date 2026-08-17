import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from './db';

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev_only_do_not_use_in_production_ever_'
);
const COOKIE = 'g4f_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: number, email: string) {
  const token = await new SignJWT({ uid: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function getSession(): Promise<{ uid: number; email: string } | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { uid: Number(payload.uid), email: String(payload.email) };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<{ uid: number; email: string }> {
  const s = await getSession();
  if (!s) throw new Error('Not authenticated');
  return s;
}

export function destroySession() {
  cookies().set(COOKIE, '', { maxAge: 0, path: '/' });
}

export function generateApiKey(): string {
  return crypto.randomBytes(24).toString('hex');
}

export async function createUser(email: string, password: string, name?: string) {
  const hash = await hashPassword(password);
  const result = await query<{ id: number }>(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
    [email.toLowerCase().trim(), hash, name || null]
  );
  return result.rows[0].id;
}

export async function findUserByEmail(email: string) {
  const result = await query(
    'SELECT id, email, password_hash, name FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}
