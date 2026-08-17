import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import {
  runDetection,
  classifyEvent,
  ParsedEvent,
} from '../../../lib/detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * These endpoints are public browser beacon endpoints.
 *
 * Authentication is done using the site's API key in the request body,
 * NOT browser cookies/credentials.
 *
 * Therefore wildcard CORS is intentional here.
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle browser CORS preflight requests.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

/**
 * Receive events from monitor.js
 */
export async function POST(req: NextRequest) {
  const headers = corsHeaders();

  try {
    const body = await req.json();

    const { apiKey, events } = body;

    // Validate request
    if (!apiKey || !Array.isArray(events)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request',
        },
        {
          status: 400,
          headers,
        }
      );
    }

    // Find the site using its API key
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
          headers,
        }
      );
    }

    let processedCount = 0;

    // Process each event
    for (const evt of events) {
      try {
        const eventName = evt.eventName || null;

        const eventType = classifyEvent(eventName);

        // Insert event into database
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
            evt.vendor || 'unknown',
            eventName,
            eventType,
            evt.pageUrl || null,
            evt.clientId || null,
            JSON.stringify(evt.params || {}),
            evt.rawUrl || null,
            evt.dlPushIndex ?? null,
            evt.source || null,
          ]
        );

        // Prepare detection event
        const parsed: ParsedEvent = {
          siteId: site.id,
          vendor: evt.vendor || 'unknown',
          eventName,
          pageUrl: evt.pageUrl || '',
          clientId: evt.clientId || null,
          params: evt.params || {},
          rawUrl: evt.rawUrl || '',
          dlPushIndex: evt.dlPushIndex,
          source: evt.source,
        };

        // Run GAFix detection logic
        await runDetection(parsed);

        processedCount++;
      } catch (err) {
        // Don't allow one bad event to stop the entire batch
        console.error('ingest single event error:', err);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        count: processedCount,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (err: any) {
    console.error('ingest error:', err);

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
