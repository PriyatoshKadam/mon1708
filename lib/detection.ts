import { query } from './db';

export interface ParsedEvent {
  siteId: number;
  eventId: number;
  receivedAt: Date | string;

  vendor: string;
  eventName: string | null;

  pageUrl: string;

  clientId: string | null;

  params: Record<string, any>;

  rawUrl: string;

  dlPushIndex: number | null;

  source: string | null;
}

/*
 * =========================================================
 * Event classification
 * =========================================================
 */

export function classifyEvent(
  eventName: string | null
): string {
  if (!eventName) {
    return 'unknown';
  }

  const automatic = new Set([
    'page_view',
    'scroll',
    'click',
    'user_engagement',
    'session_start',
    'first_visit',
    'file_download',
    'view_search_results',
    'video_start',
    'video_progress',
    'video_complete'
  ]);

  if (
    automatic.has(
      eventName
    )
  ) {
    return 'standard';
  }

  const internal = new Set([
    'exception',
    'debug',
    'monitor_event'
  ]);

  if (
    internal.has(
      eventName
    )
  ) {
    return 'internal';
  }

  return 'custom';
}

/*
 * =========================================================
 * Normalize URL
 * =========================================================
 */

function normalizePageUrl(
  url: string | null
): string {
  if (!url) {
    return '';
  }

  try {
    const parsed =
      new URL(url);

    /*
     * Ignore URL fragments.
     */

    parsed.hash = '';

    return parsed.href;
  } catch {
    return url
      .split('#')[0];
  }
}

/*
 * =========================================================
 * Extract transaction/event identity
 * =========================================================
 */

function getEventIdentity(
  event: ParsedEvent
): string {
  const params =
    event.params || {};

  /*
   * Ecommerce events:
   * transaction_id is the strongest
   * identity signal.
   */

  if (
    params.transaction_id
  ) {
    return String(
      params.transaction_id
    );
  }

  if (
    params.event_id
  ) {
    return String(
      params.event_id
    );
  }

  if (
    params.eventId
  ) {
    return String(
      params.eventId
    );
  }

  /*
   * Otherwise use the combination
   * of client + page + event.
   */

  return [
    event.clientId || '',
    normalizePageUrl(
      event.pageUrl
    ),
    event.eventName || ''
  ].join('|');
}

/*
 * =========================================================
 * Duplicate detection
 * =========================================================
 *
 * A duplicate means:
 *
 * Same site
 * + same vendor
 * + same event
 * + same client
 * + same page
 * + same identity
 * + very short time window
 *
 * NOT:
 *
 * Same event name anywhere in 3 seconds.
 *
 * =========================================================
 */

export async function checkDuplicateEvent(
  event: ParsedEvent
): Promise<boolean> {
  if (!event.eventName) {
    return false;
  }

  /*
   * Never consider different
   * pages duplicates.
   */

  const pageUrl =
    normalizePageUrl(
      event.pageUrl
    );

  const identity =
    getEventIdentity(
      event
    );

  /*
   * 3 seconds is deliberately
   * narrow.
   */

  const result =
    await query(
      `
      SELECT
        id,
        received_at,
        client_id,
        page_url,
        params
      FROM events
      WHERE site_id = $1
        AND vendor = $2
        AND event_name = $3

        AND id <> $4

        AND received_at >=
          NOW() - INTERVAL '3 seconds'

        AND COALESCE(client_id, '') =
          COALESCE($5, '')

        AND page_url = $6

      ORDER BY received_at DESC
      LIMIT 20
      `,
      [
        event.siteId,
        event.vendor,
        event.eventName,
        event.eventId,
        event.clientId,
        pageUrl
      ]
    );

  for (
    const row of result.rows
  ) {
    const previous: ParsedEvent = {
      siteId:
        event.siteId,

      eventId:
        Number(row.id),

      receivedAt:
        row.received_at,

      vendor:
        event.vendor,

      eventName:
        event.eventName,

      pageUrl:
        row.page_url || '',

      clientId:
        row.client_id || null,

      params:
        row.params || {},

      rawUrl:
        '',

      dlPushIndex:
        null,

      source:
        null
    };

    const previousIdentity =
      getEventIdentity(
        previous
      );

    if (
      previousIdentity ===
      identity
    ) {
      return true;
    }
  }

  return false;
}

/*
 * =========================================================
 * Create duplicate alert
 * =========================================================
 */

async function createDuplicateAlert(
  event: ParsedEvent
) {
  if (!event.eventName) {
    return;
  }

  await query(
    `
    INSERT INTO alerts
    (
      site_id,
      severity,
      code,
      vendor,
      event_name,
      message,
      root_cause,
      fix_steps,
      page_url,
      raw
    )
    VALUES
    (
      $1,
      'warning',
      'duplicate_event',
      $2,
      $3,
      $4,
      $5,
      $6::jsonb,
      $7,
      $8::jsonb
    )
    `,
    [
      event.siteId,

      event.vendor,

      event.eventName,

      `${event.eventName} fired more than once within 3 seconds`,

      `The same ${event.vendor} event was received multiple times for the same client and page within a very short period.`,

      JSON.stringify([
        'Check whether the event is configured in both GTM and gtag.',
        'Check whether multiple GTM tags fire the same event.',
        'Check whether the event is implemented both in code and GTM.',
        'Check whether a vendor SDK and GTM are both sending the event.'
      ]),

      event.pageUrl,

      JSON.stringify({
        eventId:
          event.eventId,

        clientId:
          event.clientId,

        params:
          event.params
      })
    ]
  );
}

/*
 * =========================================================
 * Run detection
 * =========================================================
 */

export async function runDetection(
  event: ParsedEvent
) {
  try {
    const duplicate =
      await checkDuplicateEvent(
        event
      );

    if (
      duplicate
    ) {
      await createDuplicateAlert(
        event
      );
    }

    /*
     * Add other detection rules
     * here later.
     */

  } catch (error) {
    console.error(
      'Detection error:',
      error
    );
  }
}
