import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function record(apiKey: string, method: string, pageUrl: string | null, ua: string, ip: string) {
  const siteResult = await query('SELECT id FROM sites WHERE api_key = $1 LIMIT 1', [apiKey]);
  const site = siteResult.rows[0];
  if (!site) return;
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
  await query(
    `INSERT INTO adblock_events (site_id, detection_method, page_url, user_agent, ip_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [site.id, method, pageUrl, ua, ipHash]
  );
}

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') || '';
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    let apiKey = new URL(req.url).searchParams.get('k') || '';
    let method = 'unknown';
    let pageUrl: string | null = null;

    try {
      const body = await req.json();
      apiKey = apiKey || body.apiKey;
      method = body.method || method;
      pageUrl = body.pageUrl || null;
    } catch {
      // sendBeacon with Blob may not parse as JSON
    }

    if (!apiKey) return NextResponse.json({ ok: false }, { status: 400 });
    await record(apiKey, method, pageUrl, ua, ip);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const apiKey = url.searchParams.get('k');
  if (!apiKey) return NextResponse.json({ ok: false }, { status: 400 });
  const ua = req.headers.get('user-agent') || '';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  await record(apiKey, url.searchParams.get('m') || 'get_beacon', null, ua, ip);
  // Return 1x1 gif so <img src=".../blocked?k=..."> can be used too
  const gif = Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64');
  return new NextResponse(gif, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
