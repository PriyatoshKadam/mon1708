import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public beacon endpoint.
 *
 * Authentication is done using the API key,
 * not browser cookies.
 *
 * Therefore wildcard CORS is intentional.
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle CORS preflight.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

/**
 * Record an ad-block event.
 */
async function record(
  apiKey: string,
  method: string,
  pageUrl: string | null,
  ua: string,
  ip: string
) {
  // Find site
  const siteResult = await query(
    `
      SELECT id
      FROM sites
      WHERE api_key = $1
      LIMIT 1
    `,
    [apiKey]
  );

  const site = siteResult.rows[0];

  if (!site) {
    return false;
  }

  // Hash IP for privacy
  const ipHash = crypto
    .createHash('sha256')
    .update(ip)
    .digest('hex')
    .slice(0, 32);

  await query(
    `
      INSERT INTO adblock_events
      (
        site_id,
        detection_method,
        page_url,
        user_agent,
        ip_hash
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5
      )
    `,
    [
      site.id,
      method,
      pageUrl,
      ua,
      ipHash,
    ]
  );

  return true;
}

/**
 * POST /api/blocked
 *
 * Used by navigator.sendBeacon()
 */
export async function POST(req: NextRequest) {
  const headers = corsHeaders();

  try {
    const ua = req.headers.get('user-agent') || '';

    const forwardedFor = req.headers.get('x-forwarded-for');

    const ip =
      forwardedFor
        ?.split(',')[0]
        ?.trim() || 'unknown';

    const url = new URL(req.url);

    // API key can come from query string
    let apiKey = url.searchParams.get('k') || '';

    let method = 'unknown';
    let pageUrl: string | null = null;

    /**
     * sendBeacon can send JSON, text, or a Blob.
     *
     * Therefore don't assume the request body is JSON.
     */
    try {
      const contentType =
        req.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const body = await req.json();

        apiKey = apiKey || body?.apiKey || '';
        method = body?.method || method;
        pageUrl = body?.pageUrl || null;
      } else {
        // Try reading plain text body.
        const text = await req.text();

        if (text) {
          try {
            const body = JSON.parse(text);

            apiKey = apiKey || body?.apiKey || '';
            method = body?.method || method;
            pageUrl = body?.pageUrl || null;
          } catch {
            // Ignore non-JSON beacon body
          }
        }
      }
    } catch {
      // Body may be empty, which is valid for query-string beacons
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing API key',
        },
        {
          status: 400,
          headers,
        }
      );
    }

    await record(
      apiKey,
      method,
      pageUrl,
      ua,
      ip
    );

    return NextResponse.json(
      {
        ok: true,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (err: any) {
    console.error('blocked endpoint error:', err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Internal server error',
      },
      {
        status: 500,
        headers,
      }
    );
  }
}

/**
 * GET /api/blocked?k=API_KEY
 *
 * Supports image/script fallback detection.
 */
export async function GET(req: NextRequest) {
  const headers = corsHeaders();

  try {
    const url = new URL(req.url);

    const apiKey = url.searchParams.get('k');

    if (!apiKey) {
      return new NextResponse(
        JSON.stringify({
          ok: false,
          error: 'Missing API key',
        }),
        {
          status: 400,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const ua =
      req.headers.get('user-agent') || '';

    const forwardedFor =
      req.headers.get('x-forwarded-for');

    const ip =
      forwardedFor
        ?.split(',')[0]
        ?.trim() || 'unknown';

    const method =
      url.searchParams.get('m') ||
      'get_beacon';

    await record(
      apiKey,
      method,
      null,
      ua,
      ip
    );

    /**
     * 1x1 transparent GIF.
     */
    const gif = Buffer.from(
      'R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
      'base64'
    );

    return new NextResponse(gif, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('blocked GET error:', err);

    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: err?.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
