import { query } from './db';

/**
 * Detection logic — fixed versions of the bugs reported:
 *  - Purchase currency false-positive: checks all 4 places currency can live
 *  - Custom events missed: classified rather than dropped
 *  - Duplicate event root cause: correlates dl_push_index and source
 */

const STANDARD_GA4_EVENTS = new Set([
  'page_view', 'purchase', 'add_to_cart', 'view_item', 'begin_checkout',
  'select_item', 'view_item_list', 'add_payment_info', 'add_shipping_info',
  'add_to_wishlist', 'remove_from_cart', 'search', 'select_promotion',
  'view_promotion', 'sign_up', 'login', 'share', 'select_content',
  'generate_lead', 'refund', 'view_cart', 'user_engagement', 'scroll',
  'click', 'first_visit', 'session_start', 'form_start', 'form_submit',
]);

const CURRENCY_REGEX = /^[A-Z]{3}$/;

export interface ParsedEvent {
  siteId: number;

  /*
   * Database identity of the event currently
   * being analyzed.
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
  severity: 'critical' | 'warning' | 'info';
  code: string;
  vendor?: string;
  eventName?: string;
  message: string;
  rootCause: string;
  fixSteps: string[];
  pageUrl?: string;
  raw?: any;
}

export function classifyEvent(name: string | null): string {
  if (!name) return 'unknown';
  if (STANDARD_GA4_EVENTS.has(name)) return 'standard';
  if (name.startsWith('gtm.')) return 'internal';
  return 'custom';
}

/**
 * FIX #1 — Purchase currency check that looks in every place currency
 * can actually appear in GA4 Measurement Protocol / dataLayer payloads.
 * The old bug: it only checked `params.ecommerce.currency`, which is
 * undefined in the Measurement Protocol format.
 */
export function checkPurchaseCurrency(evt: ParsedEvent): Alert | null {
  if (evt.eventName !== 'purchase' || evt.vendor !== 'ga4') return null;

  const p = evt.params || {};
  const currency =
    p.currency
    || p['ep.currency']
    || p.ecommerce?.currency
    || (Array.isArray(p.items) && p.items[0]?.currency)
    || p.cu
    || null;

  if (!currency) {
    return {
      siteId: evt.siteId,
      severity: 'critical',
      code: 'missing_currency',
      vendor: 'ga4',
      eventName: 'purchase',
      message: 'Purchase event fired without a currency parameter',
      rootCause:
        'GA4 needs a currency to compute revenue metrics, and Google Ads needs it for ROAS-based bidding. When currency is missing, the conversion still records but with revenue treated as zero — which can retrain Smart Bidding on bad data. Meta and TikTok drop the event entirely.',
      fixSteps: [
        'Open GTM Preview mode and load your checkout success page',
        'Inspect the dataLayer event — the ecommerce object likely has value but no currency',
        'Fix the source that pushes the ecommerce object (usually the order confirmation template)',
        'Alternatively, hardcode currency in the GTM tag if you sell in one currency only',
      ],
      pageUrl: evt.pageUrl,
      raw: { paramsSeen: Object.keys(p) },
    };
  }

  if (typeof currency === 'string' && !CURRENCY_REGEX.test(currency)) {
    return {
      siteId: evt.siteId,
      severity: 'warning',
      code: 'invalid_currency',
      vendor: 'ga4',
      eventName: 'purchase',
      message: `Purchase currency "${currency}" is not a valid ISO 4217 code`,
      rootCause:
        'GA4 expects a 3-letter uppercase ISO currency code like USD, EUR, INR. Non-conforming values are silently dropped during processing.',
      fixSteps: [
        'Check where the currency value is constructed in your dataLayer push',
        `Convert "${currency}" to a proper 3-letter code like ${String(currency).toUpperCase().slice(0, 3)}`,
      ],
      pageUrl: evt.pageUrl,
    };
  }

  return null;
}

/**
 * FIX #2 — Custom event handling. First-time custom events get an info
 * alert reminding the user to register them in GA4 admin.
 */
export async function checkCustomEvent(evt: ParsedEvent): Promise<Alert | null> {
  if (evt.vendor !== 'ga4' || !evt.eventName) return null;
  const kind = classifyEvent(evt.eventName);
  if (kind !== 'custom') return null;

  const existing = await query(
    'SELECT count FROM custom_events_seen WHERE site_id = $1 AND event_name = $2',
    [evt.siteId, evt.eventName]
  );

  if (!existing.rows[0]) {
    await query(
      'INSERT INTO custom_events_seen (site_id, event_name) VALUES ($1, $2)',
      [evt.siteId, evt.eventName]
    );
    return {
      siteId: evt.siteId,
      severity: 'info',
      code: 'new_custom_event',
      vendor: 'ga4',
      eventName: evt.eventName,
      message: `New custom event detected: ${evt.eventName}`,
      rootCause:
        'GA4 is receiving this event, but it will not appear as a conversion or in Google Ads until you register it in GA4 Admin.',
      fixSteps: [
        'Open GA4 → Admin → Events (may take up to 24 hours for new events to appear)',
        `Find ${evt.eventName} in the list`,
        'Toggle "Mark as key event" on if this is a conversion',
        'For Google Ads use, also import under Google Ads → Goals → Conversions → GA4 imported events',
      ],
      pageUrl: evt.pageUrl,
    };
  }

  await query(
    'UPDATE custom_events_seen SET count = count + 1, last_seen = NOW() WHERE site_id = $1 AND event_name = $2',
    [evt.siteId, evt.eventName]
  );
  return null;
}

/**
 * FIX #3 — Duplicate event detection with root-cause classification.
 * Looks back 3 seconds for identical events (name + client_id + page_url)
 * and classifies WHY they're firing multiple times.
 */
export async function checkDuplicateEvent(evt: ParsedEvent): Promise<Alert | null> {
  if (!evt.eventName || !evt.clientId) return null;

  const recent = await query(
    `SELECT id, dl_push_index, source, params, received_at
     FROM events
     WHERE site_id = $1 AND event_name = $2 AND client_id = $3 AND page_url = $4
       AND received_at > NOW() - INTERVAL '3 seconds'
     ORDER BY received_at DESC
     LIMIT 10`,
    [evt.siteId, evt.eventName, evt.clientId, evt.pageUrl]
  );

  const fires = recent.rows;
  // Include the current event to reason about it
  const totalFires = fires.length + 1;
  if (totalFires < 2) return null;

  // Classify the root cause based on the burst pattern
  const pushIndices = new Set(
    [...fires.map((f: any) => f.dl_push_index), evt.dlPushIndex].filter((x) => x != null)
  );
  const sources = new Set(
    [...fires.map((f: any) => f.source), evt.source].filter((x) => x)
  );

  let rootCause = '';
  let fixSteps: string[] = [];

  if (pushIndices.size > 1) {
    rootCause = `Your dataLayer received ${pushIndices.size} separate pushes with event="${evt.eventName}" within 3 seconds. This usually means the event is emitted from more than one place in your code — for example, both a framework router integration and a manual push in a page component.`;
    fixSteps = [
      'Open GTM Preview mode on your site',
      'Watch the dataLayer panel on a fresh pageload',
      `You should see ${pushIndices.size} separate push events with event="${evt.eventName}"`,
      'Search your codebase for all dataLayer.push calls with this event name and remove duplicates',
    ];
  } else if (sources.has('gtag_direct') && sources.has('gtm')) {
    rootCause = `The event is firing from both direct gtag() calls in your page source AND from GTM. This double-sends every event.`;
    fixSteps = [
      'Decide on one delivery method — usually GTM',
      `Search your codebase for gtag('event', '${evt.eventName}') and remove those calls`,
      'Verify in GTM Preview that only the GTM tag fires',
    ];
  } else {
    rootCause = `A single dataLayer push is triggering ${totalFires} identical event fires. This usually means multiple GTM tags share the same trigger — for example, both a modern GA4 tag and a legacy Universal Analytics or Facebook Pixel tag matching on this event.`;
    fixSteps = [
      'Open GTM → Tags and filter by the trigger firing on this event',
      'Look for redundant tags (e.g. leftover UA tags after GA4 migration)',
      'Disable or delete the duplicates and publish',
    ];
  }

  return {
    siteId: evt.siteId,
    severity: 'warning',
    code: 'duplicate_event',
    vendor: evt.vendor,
    eventName: evt.eventName,
    message: `${evt.eventName} fired ${totalFires} times within 3 seconds`,
    rootCause,
    fixSteps,
    pageUrl: evt.pageUrl,
    raw: {
      totalFires,
      distinctPushes: pushIndices.size,
      sources: Array.from(sources),
    },
  };
}

/**
 * Meta Pixel purchase requires currency and value.
 */
export function checkMetaPurchase(evt: ParsedEvent): Alert | null {
  if (evt.vendor !== 'meta') return null;
  const p = evt.params || {};
  const eventName = p.ev || evt.eventName;
  if (eventName !== 'Purchase') return null;

  const value = p['cd[value]'] || p.value;
  const currency = p['cd[currency]'] || p.currency;

  if (!value || !currency) {
    return {
      siteId: evt.siteId,
      severity: 'critical',
      code: 'meta_purchase_incomplete',
      vendor: 'meta',
      eventName: 'Purchase',
      message: 'Meta Purchase event missing value or currency',
      rootCause:
        'Meta needs both value and currency on Purchase events to optimize campaigns and attribute revenue. Missing either breaks Advantage+ campaign optimization.',
      fixSteps: [
        'Verify your fbq call sends both parameters: fbq("track", "Purchase", { value: 71.5, currency: "USD" })',
        'If using GTM, check the Meta Pixel tag configuration includes both value and currency variables',
      ],
      pageUrl: evt.pageUrl,
    };
  }
  return null;
}

/**
 * Runs all applicable checks on an event, persists alerts.
 */
export async function runDetection(evt: ParsedEvent): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const purchaseAlert = checkPurchaseCurrency(evt);
  if (purchaseAlert) alerts.push(purchaseAlert);

  const metaAlert = checkMetaPurchase(evt);
  if (metaAlert) alerts.push(metaAlert);

  const customAlert = await checkCustomEvent(evt);
  if (customAlert) alerts.push(customAlert);

  const dupAlert = await checkDuplicateEvent(evt);
  if (dupAlert) alerts.push(dupAlert);

  for (const a of alerts) {
    await query(
      `INSERT INTO alerts
        (site_id, severity, code, vendor, event_name, message, root_cause, fix_steps, page_url, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        a.siteId, a.severity, a.code, a.vendor || null, a.eventName || null,
        a.message, a.rootCause, JSON.stringify(a.fixSteps),
        a.pageUrl || null, JSON.stringify(a.raw || {}),
      ]
    );
  }

  return alerts;
}
