import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}

async function record(
  apiKey: string,
  method: string,
  pageUrl: string | null,
  ua: string,
  ip: string
) {
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
      ($1, $2, $3, $4, $5)
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

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const ua =
      req.headers.get('user-agent') || '';

    const forwardedFor =
      req.headers.get('x-forwarded-for');

    const ip =
      forwardedFor
        ?.split(',')[0]
        ?.trim() || 'unknown';

    const url = new URL(req.url);

    let apiKey =
      url.searchParams.get('k') || '';

    let method = 'unknown';
    let pageUrl: string | null = null;

    try {
      const contentType =
        req.headers.get('content-type') || '';

      if (
        contentType.includes(
          'application/json'
        )
      ) {
        const body = await req.json();

        apiKey =
          apiKey ||
          body?.apiKey ||
          '';

        method =
          body?.method ||
          method;

        pageUrl =
          body?.pageUrl ||
          null;
      } else {
        const text =
          await req.text();

        if (text) {
          try {
            const body =
              JSON.parse(text);

            apiKey =
              apiKey ||
              body?.apiKey ||
              '';

            method =
              body?.method ||
              method;

            pageUrl =
              body?.pageUrl ||
              null;
          } catch {
            // Ignore non-JSON beacon body.
          }
        }
      }
    } catch {
      // Empty beacon body is allowed.
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing API key',
        },
        {
          status: 400,
          headers: corsHeaders,
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
        headers: corsHeaders,
      }
    );
  } catch (err: any) {
    console.error(
      'blocked POST error:',
      err
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          'Internal server error',
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

export async function GET(
  req: NextRequest
) {
  const corsHeaders =
    getCorsHeaders(req);

  try {
    const url =
      new URL(req.url);

    const apiKey =
      url.searchParams.get('k');

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing API key',
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const ua =
      req.headers.get(
        'user-agent'
      ) || '';

    const forwardedFor =
      req.headers.get(
        'x-forwarded-for'
      );

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

    const gif =
      Buffer.from(
        'R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        'base64'
      );

    return new NextResponse(
      gif,
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type':
            'image/gif',
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
          Pragma:
            'no-cache',
        },
      }
    );
  } catch (err: any) {
    console.error(
      'blocked GET error:',
      err
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          'Internal server error',
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}
