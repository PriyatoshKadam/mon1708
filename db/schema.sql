-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sites monitored by each user
CREATE TABLE IF NOT EXISTS sites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  gtm_container_id TEXT,
  ga4_measurement_id TEXT,
  gads_conversion_id TEXT,
  meta_pixel_id TEXT,
  tiktok_pixel_id TEXT,
  api_key TEXT NOT NULL UNIQUE,
  first_party_domain TEXT,             -- e.g. analytics.customer.com (CNAMEd)
  slack_webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_api_key ON sites(api_key);
CREATE INDEX IF NOT EXISTS idx_sites_fp_domain ON sites(first_party_domain);

-- Every event we intercept
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  vendor TEXT NOT NULL,                -- 'ga4', 'gads', 'meta', 'tiktok', etc
  event_name TEXT,
  event_type TEXT,                     -- 'standard', 'custom', 'internal'
  page_url TEXT,
  client_id TEXT,
  params JSONB DEFAULT '{}'::jsonb,
  raw_url TEXT,
  dl_push_index INT,                   -- from window.__g4f_push_idx
  source TEXT,                         -- 'gtm', 'gtag_direct', 'unknown'
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_site_time ON events(site_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_site_vendor ON events(site_id, vendor);
CREATE INDEX IF NOT EXISTS idx_events_site_name ON events(site_id, event_name);
CREATE INDEX IF NOT EXISTS idx_events_dedupe ON events(site_id, event_name, client_id, page_url, received_at);

-- Alerts raised by detection logic
CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,              -- 'critical', 'warning', 'info'
  code TEXT NOT NULL,                  -- 'missing_currency', 'duplicate_event', etc
  vendor TEXT,
  event_name TEXT,
  message TEXT NOT NULL,
  root_cause TEXT,
  fix_steps JSONB DEFAULT '[]'::jsonb,
  page_url TEXT,
  raw JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_site_time ON alerts(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_site_severity ON alerts(site_id, severity, resolved);

-- Ad-blocker detected sessions (from fallback beacon)
CREATE TABLE IF NOT EXISTS adblock_events (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  detection_method TEXT,               -- 'script_error', 'timeout', 'bait_blocked'
  page_url TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  blocked_vendors JSONB DEFAULT '[]'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adblock_site_time ON adblock_events(site_id, detected_at DESC);

-- Track first-seen custom events per site so we alert once
CREATE TABLE IF NOT EXISTS custom_events_seen (
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (site_id, event_name)
);
