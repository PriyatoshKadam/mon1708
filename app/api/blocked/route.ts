import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cors(req: NextRequest) {
  const origin =
    req.headers.get('origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods':
      'GET, POST, OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type',

    'Access-Control-Allow-Credentials':
      'true',

    'Access-Control-Max-Age':
      '86400',

    Vary:
      'Origin'
  };

  if (origin) {
    headers[
      'Access-Control-Allow-Origin'
    ] = origin;
  }

  return headers;
}

export async function OPTIONS(
  req: NextRequest
) {
  return new NextResponse(
    null,
    {
      status: 204,
      headers: cors(req)
    }
  );
}

export async function GET(
  req: NextRequest
) {
  const headers =
    cors(req);

  try {
    const url =
      new URL(req.url);

    const apiKey =
      url.searchParams.get('k');

    const method =
      url.searchParams.get('m') ||
      'unknown';

    const eventName =
      url.searchParams.get('e');

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing API key'
        },
        {
          status: 400,
          headers
        }
      );
    }

    const siteResult =
      await query(
        `
        SELECT id
        FROM sites
        WHERE api_key = $1
        LIMIT 1
        `,
        [apiKey]
      );

    if (
      siteResult.rows.length ===
        0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Invalid API key'
        },
        {
          status: 401,
          headers
        }
      );
    }

    const siteId =
      siteResult.rows[0].id;

    const pageUrl =
      req.headers.get(
        'referer'
      ) || null;

    const userAgent =
      req.headers.get(
        'user-agent'
      ) || '';

    const forwarded =
      req.headers.get(
        'x-forwarded-for'
      );

    const ip =
      forwarded
        ? forwarded
            .split(',')[0]
            .trim()
        : 'unknown';

    const ipHash =
      crypto
        .createHash('sha256')
        .update(ip)
        .digest('hex')
        .slice(0, 32);

    let blockedVendors: string[] =
      [];

    switch (method) {
      case 'ga4_event_blocked':
      case 'google_analytics_script_blocked':
        blockedVendors = [
          'ga4'
        ];
        break;

      case 'google_ads_script_blocked':
        blockedVendors = [
          'gads'
        ];
        break;

      case 'meta_script_blocked':
        blockedVendors = [
          'meta'
        ];
        break;

      case 'tiktok_script_blocked':
        blockedVendors = [
          'tiktok'
        ];
        break;

      case 'bait_blocked':
        blockedVendors = [];
        break;

      default:
        blockedVendors = [];
    }

    /*
     * Store event name inside the
     * JSON payload so the existing
     * schema doesn't need a new column.
     */

    const raw = {
      event_name:
        eventName || null,

      detection_method:
        method,

      blocked_vendors:
        blockedVendors
    };

    await query(
      `
      INSERT INTO adblock_events
      (
        site_id,
        detection_method,
        page_url,
        user_agent,
        ip_hash,
        blocked_vendors
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::jsonb
      )
      `,
      [
        siteId,
        method,
        pageUrl,
        userAgent,
        ipHash,
        JSON.stringify(
          {
            vendors:
              blockedVendors,

            event_name:
              eventName || null,

            raw
          }
        )
      ]
    );

    return NextResponse.json(
      {
        ok: true
      },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error(
      'blocked endpoint error:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error'
      },
      {
        status: 500,
        headers
      }
    );
  }
}

export async function POST(
  req: NextRequest
) {
  const headers =
    cors(req);

  try {
    const url =
      new URL(req.url);

    let apiKey =
      url.searchParams.get('k') ||
      '';

    let method =
      url.searchParams.get('m') ||
      'unknown';

    let eventName =
      url.searchParams.get('e') ||
      null;

    let pageUrl:
      | string
      | null =
      null;

    try {
      const body =
        await req.json();

      apiKey =
        apiKey ||
        body?.apiKey ||
        '';

      method =
        body?.method ||
        method;

      eventName =
        body?.eventName ||
        eventName;

      pageUrl =
        body?.pageUrl ||
        null;
    } catch {
      /*
       * sendBeacon may send an
       * empty body.
       */
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing API key'
        },
        {
          status: 400,
          headers
        }
      );
    }

    const siteResult =
      await query(
        `
        SELECT id
        FROM sites
        WHERE api_key = $1
        LIMIT 1
        `,
        [apiKey]
      );

    if (
      siteResult.rows.length ===
        0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Invalid API key'
        },
        {
          status: 401,
          headers
        }
      );
    }

    const siteId =
      siteResult.rows[0].id;

    const userAgent =
      req.headers.get(
        'user-agent'
      ) || '';

    const forwarded =
      req.headers.get(
        'x-forwarded-for'
      );

    const ip =
      forwarded
        ? forwarded
            .split(',')[0]
            .trim()
        : 'unknown';

    const ipHash =
      crypto
        .createHash('sha256')
        .update(ip)
        .digest('hex')
        .slice(0, 32);

    let vendors: string[] =
      [];

    if (
      method.includes('ga4') ||
      method.includes(
        'google_analytics'
      )
    ) {
      vendors = ['ga4'];
    } else if (
      method.includes(
        'google_ads'
      )
    ) {
      vendors = ['gads'];
    } else if (
      method.includes('meta')
    ) {
      vendors = ['meta'];
    } else if (
      method.includes('tiktok')
    ) {
      vendors = ['tiktok'];
    }

    await query(
      `
      INSERT INTO adblock_events
      (
        site_id,
        detection_method,
        page_url,
        user_agent,
        ip_hash,
        blocked_vendors
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::jsonb
      )
      `,
      [
        siteId,
        method,
        pageUrl ||
          req.headers.get(
            'referer'
          ) ||
          null,
        userAgent,
        ipHash,
        JSON.stringify({
          vendors,
          event_name:
            eventName
        })
      ]
    );

    return NextResponse.json(
      {
        ok: true
      },
      {
        status: 200,
        headers
      }
    );
  } catch (error) {
    console.error(
      'blocked POST error:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error'
      },
      {
        status: 500,
        headers
      }
    );
  }
}
