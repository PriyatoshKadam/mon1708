import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware handles two things:
 *
 * 1. First-party domain routing — if a request comes in on a customer's
 *    CNAMEd subdomain (e.g., analytics.customer.com), we only serve the
 *    monitor.js / ingest / blocked endpoints. Everything else 404s so
 *    the customer's users can't stumble into our dashboard.
 *
 * 2. Dashboard auth guard — /dashboard/* requires a valid session cookie.
 *    If missing, redirect to /login.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const url = req.nextUrl;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const appHost = appUrl ? new URL(appUrl).host : '';

  // 1. First-party CNAME requests: only allow monitor + ingest + blocked
  const isPrimary =
    !appHost ||
    host === appHost ||
    host.includes('localhost') ||
    host.includes('.onrender.com') ||
    host === new URL(appUrl || 'http://localhost').host;

  if (!isPrimary) {
    const allowed = [
      '/monitor.js',
      '/api/ingest',
      '/api/blocked',
      '/api/health',
    ];
    const isAllowed = allowed.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'));
    if (!isAllowed) {
      return new NextResponse('Not found', { status: 404 });
    }
    // Add CORS for first-party origins
    const res = NextResponse.next();
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  }

  // 2. Dashboard auth guard
  if (url.pathname.startsWith('/dashboard')) {
    const session = req.cookies.get('g4f_session');
    if (!session) {
      const login = new URL('/login', url);
      login.searchParams.set('next', url.pathname);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
