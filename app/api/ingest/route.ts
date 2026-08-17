const inserted = await query(
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
    RETURNING id, received_at
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

const dbEvent = inserted.rows[0];

const parsed: ParsedEvent = {
  siteId: site.id,

  eventId: Number(dbEvent.id),

  receivedAt: dbEvent.received_at,

  vendor: evt.vendor || 'unknown',

  eventName,

  pageUrl: evt.pageUrl || '',

  clientId: evt.clientId || null,

  params: evt.params || {},

  rawUrl: evt.rawUrl || '',

  dlPushIndex: evt.dlPushIndex ?? null,

  source: evt.source || null,
};

await runDetection(parsed);
