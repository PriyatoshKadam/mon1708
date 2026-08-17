import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import {
  runDetection,
  classifyEvent,
  ParsedEvent,
} from '../../../lib/detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  /*
   * IMPORTANT:
   * Do NOT use Access-Control-Allow-Origin: *
   * on API responses.
   *
   * Echo the requesting origin.
   */
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

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json();

    const {
      apiKey,
      events,
    } = body;

    if (!apiKey || !Array.isArray(events)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request',
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

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
      return NextResponse.json(
        {
          ok: false,
          error: 'Unknown API key',
        },
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    let processedCount = 0;

    for (const evt of events) {
      try {
        const eventName =
          evt.eventName ||
          evt.event_name ||
          null;

        const eventType =
          classifyEvent(eventName);

        await query(
          `
            INSERT INTO events
            (
              site_id,
              vendor,
              event_name,
              event_type,
              page_url,
              client_id,
              params,
              raw_url,
              dl_push_index,
              source
            )
            VALUES
            (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10
            )
          `,
          [
            site.id,

            evt.vendor ||
              'unknown',

            eventName,

            eventType,

            evt.pageUrl ||
              null,

            evt.clientId ||
              null,

            JSON.stringify(
              evt.params || {}
            ),

            evt.rawUrl ||
              null,

            evt.dlPushIndex ??
              null,

            evt.source ||
              null,
          ]
        );

        const parsed: ParsedEvent = {
          siteId: site.id,

          vendor:
            evt.vendor ||
            'unknown',

          eventName,

          pageUrl:
            evt.pageUrl ||
            '',

          clientId:
            evt.clientId ||
            null,

          params:
            evt.params ||
            {},

          rawUrl:
            evt.rawUrl ||
            '',

          dlPushIndex:
            evt.dlPushIndex ??
            null,

          source:
            evt.source ||
            null,
        };

        await runDetection(parsed);

        processedCount++;

      } catch (err) {
        console.error(
          'ingest single event error:',
          err
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        count: processedCount,
      },
      {
        status: 200,
        headers: corsHeaders,
      }
    );

  } catch (err: any) {

    console.error(
      'ingest error:',
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
