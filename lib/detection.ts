import { query } from './db';

/*
 * ============================================================
 * GA4Fix Detection Engine
 * ============================================================
 *
 * Responsibilities:
 *  - Classify GA4 standard/custom/internal events
 *  - Detect missing/invalid purchase currency
 *  - Detect Meta Purchase problems
 *  - Detect new custom GA4 events
 *  - Detect genuine duplicate events
 *  - Identify likely duplicate root cause
 *
 * IMPORTANT:
 * The event is inserted into `events` BEFORE this file runs.
 * Therefore duplicate detection MUST exclude evt.eventId.
 * ============================================================
 */

const STANDARD_GA4_EVENTS = new Set([
  'page_view',
  'purchase',
  'add_to_cart',
  'view_item',
  'begin_checkout',
  'select_item',
  'view_item_list',
  'add_payment_info',
  'add_shipping_info',
  'add_to_wishlist',
  'remove_from_cart',
  'search',
  'select_promotion',
  'view_promotion',
  'login',
  'sign_up',
  'share',
  'select_content',
  'generate_lead',
  'refund',
  'view_cart',
  'user_engagement',
  'scroll',
  'click',
  'first_visit',
  'session_start',
  'form_start',
  'form_submit',
]);

const CURRENCY_REGEX = /^[A-Z]{3}$/;

/*
 * These events naturally repeat.
 *
 * We don't want:
 *
 * scroll
 * scroll
 * scroll
 *
 * to create duplicate alerts.
 */
const NATURALLY_REPEATING_EVENTS = new Set([
  'scroll',
  'user_engagement',
]);

export interface ParsedEvent {
  siteId: number;

  /*
   * ID returned from INSERT ... RETURNING id.
   *
   * This is REQUIRED for correct duplicate detection.
   */
  eventId?: number;

  receivedAt?: string | Date;

  vendor: string;

  eventName: string | null;

  pageUrl: string;

  clientId: string | null;

  params: Record<string, any>;

  rawUrl: string;

  dlPushIndex?: number | null;

  source?: string | null;
}

export interface Alert {
  siteId: number;

  severity:
    | 'critical'
    | 'warning'
    | 'info';

  code: string;

  vendor?: string;

  eventName?: string;

  message: string;

  rootCause: string;

  fixSteps: string[];

  pageUrl?: string;

  raw?: any;
}


/*
 * ============================================================
 * EVENT CLASSIFICATION
 * ============================================================
 */

export function classifyEvent(
  name: string | null
): string {

  if (!name) {
    return 'unknown';
  }

  if (
    name.startsWith('gtm.')
  ) {
    return 'internal';
  }

  if (
    STANDARD_GA4_EVENTS.has(name)
  ) {
    return 'standard';
  }

  return 'custom';
}


/*
 * ============================================================
 * PURCHASE CURRENCY
 * ============================================================
 */

export function checkPurchaseCurrency(
  evt: ParsedEvent
): Alert | null {

  if (
    evt.eventName !== 'purchase' ||
    evt.vendor !== 'ga4'
  ) {
    return null;
  }

  const p =
    evt.params || {};

  /*
   * GA4 can expose currency in several
   * formats depending on implementation.
   */
  const currency =
    p.currency ||
    p['ep.currency'] ||
    p.ecommerce?.currency ||
    (
      Array.isArray(p.items)
        ? p.items[0]?.currency
        : null
    ) ||
    p.cu ||
    null;

  /*
   * Missing currency
   */
  if (!currency) {

    return {
      siteId:
        evt.siteId,

      severity:
        'critical',

      code:
        'missing_currency',

      vendor:
        'ga4',

      eventName:
        'purchase',

      message:
        'Purchase event fired without a currency parameter',

      rootCause:
        'The GA4 purchase event contains no currency value. Revenue reporting and conversion-value optimization can therefore be incorrect.',

      fixSteps: [
        'Open GTM Preview mode',
        'Trigger a test purchase',
        'Inspect the purchase dataLayer event',
        'Check that ecommerce.currency exists',
        'Make sure the GA4 purchase tag receives the currency value',
      ],

      pageUrl:
        evt.pageUrl,

      raw: {
        paramsSeen:
          Object.keys(p),
      },
    };
  }

  /*
   * Invalid currency
   */
  if (
    typeof currency === 'string' &&
    !CURRENCY_REGEX.test(
      currency
    )
  ) {

    return {
      siteId:
        evt.siteId,

      severity:
        'warning',

      code:
        'invalid_currency',

      vendor:
        'ga4',

      eventName:
        'purchase',

      message:
        `Purchase currency "${currency}" is not a valid ISO 4217 code`,

      rootCause:
        'GA4 currency values should use a three-letter uppercase ISO 4217 code such as INR, USD or EUR.',

      fixSteps: [
        'Open the purchase dataLayer event',
        'Check the currency value',
        'Use a three-letter uppercase ISO 4217 code',
        'Examples: INR, USD, EUR, GBP',
      ],

      pageUrl:
        evt.pageUrl,

      raw: {
        currency,
      },
    };
  }

  return null;
}


/*
 * ============================================================
 * CUSTOM EVENT DETECTION
 * ============================================================
 */

export async function checkCustomEvent(
  evt: ParsedEvent
): Promise<Alert | null> {

  if (
    evt.vendor !== 'ga4' ||
    !evt.eventName
  ) {
    return null;
  }

  const type =
    classifyEvent(
      evt.eventName
    );

  if (type !== 'custom') {
    return null;
  }

  const existing =
    await query(
      `
        SELECT
          count
        FROM custom_events_seen
        WHERE
          site_id = $1
          AND event_name = $2
      `,
      [
        evt.siteId,
        evt.eventName,
      ]
    );

  /*
   * First time we've seen this custom event.
   */
  if (
    !existing.rows[0]
  ) {

    await query(
      `
        INSERT INTO custom_events_seen
        (
          site_id,
          event_name
        )
        VALUES
        (
          $1,
          $2
        )
        ON CONFLICT
        (
          site_id,
          event_name
        )
        DO UPDATE SET
          last_seen = NOW(),
          count = custom_events_seen.count + 1
      `,
      [
        evt.siteId,
        evt.eventName,
      ]
    );

    return {
      siteId:
        evt.siteId,

      severity:
        'info',

      code:
        'new_custom_event',

      vendor:
        'ga4',

      eventName:
        evt.eventName,

      message:
        `New custom event detected: ${evt.eventName}`,

      rootCause:
        'GA4 is receiving a custom event that has not previously been observed by GA4Fix.',

      fixSteps: [
        'Open GA4 → Admin → Events',
        `Find ${evt.eventName}`,
        'If this event is important, mark it as a key event',
        'If it is used for Google Ads, import the event into Google Ads',
      ],

      pageUrl:
        evt.pageUrl,
    };
  }

  /*
   * Existing event.
   */
  await query(
    `
      UPDATE custom_events_seen
      SET
        last_seen = NOW(),
        count = count + 1
      WHERE
        site_id = $1
        AND event_name = $2
    `,
    [
      evt.siteId,
      evt.eventName,
    ]
  );

  return null;
}


/*
 * ============================================================
 * DUPLICATE EVENT DETECTION
 * ============================================================
 *
 * THIS is the function you were asking about.
 *
 * It lives in:
 *
 *     lib/detection.ts
 *
 * The old implementation had:
 *
 *     SELECT recent events
 *     totalFires = recent.length + 1
 *
 * But the current event was ALREADY inserted.
 *
 * Therefore:
 *
 *     one real event
 *     ↓
 *     DB contains 1
 *     ↓
 *     +1
 *     ↓
 *     falsely reports 2
 *
 * The new implementation explicitly excludes:
 *
 *     id <> evt.eventId
 *
 * ============================================================
 */

export async function checkDuplicateEvent(
  evt: ParsedEvent
): Promise<Alert | null> {

  /*
   * We need a database ID to exclude the current event.
   */
  if (
    !evt.eventId ||
    !evt.eventName
  ) {
    return null;
  }

  /*
   * Without client ID we cannot confidently
   * identify the same visitor firing the same
   * event.
   */
  if (
    !evt.clientId
  ) {
    return null;
  }

  /*
   * Naturally repeating events are not treated
   * as duplicates simply because they repeat.
   */
  if (
    evt.vendor === 'ga4' &&
    NATURALLY_REPEATING_EVENTS.has(
      evt.eventName
    )
  ) {
    return null;
  }

  /*
   * Find PREVIOUS events only.
   *
   * IMPORTANT:
   *
   * id <> $2
   *
   * excludes the event currently being analyzed.
   */
  const recent =
    await query(
      `
        SELECT
          id,
          vendor,
          event_name,
          client_id,
          page_url,
          params,
          raw_url,
          dl_push_index,
          source,
          received_at
        FROM events
        WHERE
          site_id = $1
          AND id <> $2
          AND vendor = $3
          AND event_name = $4
          AND client_id = $5
          AND page_url = $6
          AND received_at >
              NOW() - INTERVAL '3 seconds'
        ORDER BY
          received_at DESC
        LIMIT 20
      `,
      [
        evt.siteId,
        evt.eventId,
        evt.vendor,
        evt.eventName,
        evt.clientId,
        evt.pageUrl,
      ]
    );

  const previous =
    recent.rows;

  /*
   * No previous matching event.
   *
   * Therefore this event is NOT duplicated.
   */
  if (
    previous.length === 0
  ) {
    return null;
  }

  /*
   * Current event + previous events.
   */
  const totalFires =
    previous.length + 1;

  /*
   * ==========================================================
   * ANALYZE THE DUPLICATE
   * ==========================================================
   */

  const allEvents = [
    ...previous,

    {
      id:
        evt.eventId,

      vendor:
        evt.vendor,

      event_name:
        evt.eventName,

      client_id:
        evt.clientId,

      page_url:
        evt.pageUrl,

      params:
        evt.params,

      raw_url:
        evt.rawUrl,

      dl_push_index:
        evt.dlPushIndex,

      source:
        evt.source,

      received_at:
        evt.receivedAt,
    },
  ];

  /*
   * DataLayer push indexes.
   */
  const pushIndices =
    new Set(
      allEvents
        .map(
          (event: any) =>
            event.dl_push_index
        )
        .filter(
          (value) =>
            value !== null &&
            value !== undefined
        )
    );

  /*
   * Sources.
   */
  const sources =
    new Set(
      allEvents
        .map(
          (event: any) =>
            event.source
        )
        .filter(Boolean)
    );

  let rootCause =
    '';

  let fixSteps:
    string[] = [];


  /*
   * ==========================================================
   * CASE 1
   *
   * Multiple dataLayer pushes.
   * ==========================================================
   */

  if (
    pushIndices.size > 1
  ) {

    rootCause =
      `The "${evt.eventName}" event was pushed to the dataLayer ${pushIndices.size} separate times within 3 seconds. This indicates that the application is generating the event more than once.`;

    fixSteps = [
      'Open GTM Preview mode',
      `Search for the "${evt.eventName}" dataLayer event`,
      'Check whether it appears more than once',
      'Search your application code for all dataLayer.push calls using this event',
      'Remove the unintended duplicate push',
    ];
  }


  /*
   * ==========================================================
   * CASE 2
   *
   * GTM + direct gtag.
   * ==========================================================
   */

  else if (
    sources.has(
      'gtag_direct'
    ) &&
    sources.has(
      'gtm'
    )
  ) {

    rootCause =
      `The "${evt.eventName}" event is being sent through both direct gtag() code and Google Tag Manager. Both implementations can send the same event to GA4.`;

    fixSteps = [
      'Choose one tracking implementation',
      'Prefer Google Tag Manager if GTM is your primary tracking system',
      `Search the application for "${evt.eventName}"`,
      'Look for direct gtag() calls',
      'Remove the duplicate implementation',
      'Verify the event in GTM Preview',
    ];
  }


  /*
   * ==========================================================
   * CASE 3
   *
   * Same dataLayer push, multiple requests.
   * ==========================================================
   */

  else if (
    pushIndices.size === 1 &&
    pushIndices.size > 0
  ) {

    rootCause =
      `The "${evt.eventName}" event appears to originate from the same dataLayer push but generated multiple ${evt.vendor} requests. This strongly suggests multiple tags are responding to the same trigger.`;

    fixSteps = [
      'Open GTM Preview',
      `Select the "${evt.eventName}" event`,
      'Open the Tags Fired section',
      `Check how many ${evt.vendor} tags fired`,
      'Look for duplicate GA4 tags or duplicate triggers',
      'Disable the redundant tag',
      'Publish the GTM container',
    ];
  }


  /*
   * ==========================================================
   * CASE 4
   *
   * Unknown.
   * ==========================================================
   */

  else {

    rootCause =
      `The "${evt.eventName}" event was sent ${totalFires} times within 3 seconds for the same client and page. The network data does not provide enough information to identify the exact implementation source.`;

    fixSteps = [
      'Open GTM Preview',
      `Check the "${evt.eventName}" event`,
      'Inspect all tags that fired',
      'Check the website source for direct tracking calls',
      'Compare dataLayer pushes with network requests',
    ];
  }


  /*
   * ==========================================================
   * ALERT DEDUPLICATION
   * ==========================================================
   *
   * Suppose three duplicate requests happen:
   *
   * request 1
   * request 2
   * request 3
   *
   * We don't want three dashboard alerts.
   *
   * Only one alert per duplicate burst.
   * ==========================================================
   */

  const existingAlert =
    await query(
      `
        SELECT
          id
        FROM alerts
        WHERE
          site_id = $1
          AND code = 'duplicate_event'
          AND vendor = $2
          AND event_name = $3
          AND page_url = $4
          AND created_at >
              NOW() - INTERVAL '3 seconds'
        LIMIT 1
      `,
      [
        evt.siteId,
        evt.vendor,
        evt.eventName,
        evt.pageUrl,
      ]
    );

  if (
    existingAlert.rows.length > 0
  ) {
    return null;
  }


  /*
   * ==========================================================
   * RETURN ALERT
   * ==========================================================
   */

  return {

    siteId:
      evt.siteId,

    severity:
      'warning',

    code:
      'duplicate_event',

    vendor:
      evt.vendor,

    eventName:
      evt.eventName,

    message:
      `${evt.eventName} fired ${totalFires} times within 3 seconds`,

    rootCause,

    fixSteps,

    pageUrl:
      evt.pageUrl,

    raw: {

      totalFires,

      currentEventId:
        evt.eventId,

      previousEventIds:
        previous.map(
          (event: any) =>
            event.id
        ),

      distinctPushes:
        pushIndices.size,

      sources:
        Array.from(
          sources
        ),
    },
  };
}


/*
 * ============================================================
 * META PURCHASE
 * ============================================================
 */

export function checkMetaPurchase(
  evt: ParsedEvent
): Alert | null {

  if (
    evt.vendor !== 'meta'
  ) {
    return null;
  }

  const p =
    evt.params || {};

  const eventName =
    p.ev ||
    evt.eventName;

  if (
    eventName !== 'Purchase'
  ) {
    return null;
  }

  const value =
    p['cd[value]'] ||
    p.value;

  const currency =
    p['cd[currency]'] ||
    p.currency;

  if (
    value == null ||
    !currency
  ) {

    return {

      siteId:
        evt.siteId,

      severity:
        'critical',

      code:
        'meta_purchase_incomplete',

      vendor:
        'meta',

      eventName:
        'Purchase',

      message:
        'Meta Purchase event missing value or currency',

      rootCause:
        'The Meta Purchase event does not contain both value and currency.',

      fixSteps: [
        'Verify the fbq Purchase call',
        'Check that value is passed',
        'Check that currency is passed',
        'Example: fbq("track", "Purchase", {value: 100, currency: "USD"})',
      ],

      pageUrl:
        evt.pageUrl,

      raw: {
        value,
        currency,
      },
    };
  }

  return null;
}


/*
 * ============================================================
 * RUN ALL DETECTION
 * ============================================================
 */

export async function runDetection(
  evt: ParsedEvent
): Promise<Alert[]> {

  const alerts:
    Alert[] = [];


  /*
   * Purchase currency
   */
  const purchaseAlert =
    checkPurchaseCurrency(
      evt
    );

  if (
    purchaseAlert
  ) {
    alerts.push(
      purchaseAlert
    );
  }


  /*
   * Meta Purchase
   */
  const metaAlert =
    checkMetaPurchase(
      evt
    );

  if (
    metaAlert
  ) {
    alerts.push(
      metaAlert
    );
  }


  /*
   * Custom event
   */
  const customAlert =
    await checkCustomEvent(
      evt
    );

  if (
    customAlert
  ) {
    alerts.push(
      customAlert
    );
  }


  /*
   * Duplicate event
   */
  const duplicateAlert =
    await checkDuplicateEvent(
      evt
    );

  if (
    duplicateAlert
  ) {
    alerts.push(
      duplicateAlert
    );
  }


  /*
   * Persist alerts
   */
  for (
    const alert of alerts
  ) {

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
        alert.siteId,

        alert.severity,

        alert.code,

        alert.vendor ||
          null,

        alert.eventName ||
          null,

        alert.message,

        alert.rootCause,

        JSON.stringify(
          alert.fixSteps
        ),

        alert.pageUrl ||
          null,

        JSON.stringify(
          alert.raw ||
          {}
        ),
      ]
    );
  }

  return alerts;
}
