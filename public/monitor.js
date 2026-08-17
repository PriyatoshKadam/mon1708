/*!
 * GA4Fix monitor.js v2.0
 * Real-user tag & event monitoring for GA4, Google Ads, Meta, TikTok, and 15+ vendors.
 */
(function () {
  'use strict';

  var g = window.__g4f || {};
  if (g.installed) return;
  g.installed = true;
  g.r = true; // ready flag — read by the fallback beacon
  window.__g4f = g;

  // --- config from the URL that loaded this script ------------------------------
  var scriptTag = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  var scriptUrl = new URL(scriptTag.src);
  var API_KEY = scriptUrl.searchParams.get('apiKey') || g.k;
  var GTM_ID = scriptUrl.searchParams.get('gtmContainerId') || g.c;

  // Ingest / beacon endpoints. If the script was loaded from a first-party
  // subdomain (via CNAME), use that same origin so the ingest calls are
  // also first-party — this is what actually defeats ad blockers.
  var BASE = scriptUrl.origin;
  var INGEST = BASE + '/api/ingest';
  var BLOCKED = BASE + '/api/blocked';

  // --- vendor patterns (mirrored from lib/vendors.ts) ---------------------------
  var VENDORS = [
    { name: 'ga4',      re: /google-analytics\.com\/(g|mp)\/collect|analytics\.google\.com\/g\/collect/i },
    { name: 'gads',     re: /googleadservices\.com|google\.com\/pagead\/conversion/i },
    { name: 'gtm',      re: /googletagmanager\.com\/(gtm|gtag)\.js/i },
    { name: 'meta',     re: /facebook\.com\/tr|connect\.facebook\.net/i },
    { name: 'tiktok',   re: /analytics\.tiktok\.com|business-api\.tiktok\.com/i },
    { name: 'linkedin', re: /snap\.licdn\.com|px\.ads\.linkedin\.com/i },
    { name: 'pinterest',re: /ct\.pinterest\.com/i },
    { name: 'twitter',  re: /ads-twitter\.com|analytics\.twitter\.com|t\.co\/i\/adsct/i },
    { name: 'reddit',   re: /redditstatic\.com\/ads|events\.redditmedia\.com/i },
    { name: 'snapchat', re: /sc-static\.net\/scevent|tr\.snapchat\.com/i },
    { name: 'hotjar',   re: /hotjar\.com/i },
    { name: 'clarity',  re: /clarity\.ms/i },
    { name: 'mixpanel', re: /api\.mixpanel\.com/i },
    { name: 'amplitude',re: /amplitude\.com/i },
    { name: 'segment',  re: /segment\.(io|com)/i },
    { name: 'hubspot',  re: /hs-scripts\.com|hubspot\.com/i },
    { name: 'klaviyo',  re: /klaviyo\.com/i },
    { name: 'intercom', re: /intercom\.io|intercom\.com/i },
  ];

  function detectVendor(url) {
    for (var i = 0; i < VENDORS.length; i++) {
      if (VENDORS[i].re.test(url)) return VENDORS[i].name;
    }
    return null;
  }

  // --- dataLayer push-index tracking (root-cause for duplicates) ----------------
  window.dataLayer = window.dataLayer || [];
  var pushIndex = 0;
  var originalPush = window.dataLayer.push;
  window.dataLayer.push = function () {
    for (var i = 0; i < arguments.length; i++) {
      var evt = arguments[i];
      if (evt && typeof evt === 'object') {
        pushIndex++;
        try {
          Object.defineProperty(evt, '__g4f_push_idx', { value: pushIndex, writable: false, enumerable: false });
          Object.defineProperty(evt, '__g4f_ts', { value: Date.now(), writable: false, enumerable: false });
        } catch (e) {
          evt.__g4f_push_idx = pushIndex;
          evt.__g4f_ts = Date.now();
        }
      }
    }
    return originalPush.apply(this, arguments);
  };

  // --- event queue + send -------------------------------------------------------
  var queue = g.q || [];
  var flushTimer = null;

  function send(payload) {
    queue.push(payload);
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 400);
  }

  function flush() {
    flushTimer = null;
    if (!queue.length) return;
    var batch = queue.splice(0, queue.length);
    var body = JSON.stringify({ apiKey: API_KEY, events: batch });
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(INGEST, blob);
        return;
      }
    } catch (e) {}
    fetch(INGEST, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(function () {});
  }

  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);

  // --- parse a captured URL into an event record --------------------------------
  function parseGa4(url) {
    var u = new URL(url);
    var params = {};
    u.searchParams.forEach(function (v, k) {
      // Prefix conflicts: last wins for now, good enough for detection
      params[k] = v;
    });
    // GA4 uses en=event_name and ep.* / epn.* prefixes
    var eventName = params.en || null;
    var clientId = params.cid || params.tid || null;
    // Also lift ep.* into flat keys for detection
    Object.keys(params).forEach(function (k) {
      if (k.indexOf('ep.') === 0 || k.indexOf('epn.') === 0) {
        params[k.slice(k.indexOf('.') + 1)] = params[k];
      }
    });
    return { eventName: eventName, clientId: clientId, params: params };
  }

  function parseMeta(url) {
    var u = new URL(url);
    var params = {};
    u.searchParams.forEach(function (v, k) { params[k] = v; });
    return { eventName: params.ev || null, clientId: params.id || null, params: params };
  }

  function parseGeneric(url) {
    var u = new URL(url);
    var params = {};
    u.searchParams.forEach(function (v, k) { params[k] = v; });
    return { eventName: params.en || params.event || null, clientId: null, params: params };
  }

  function record(url, method) {
    try {
      var vendor = detectVendor(url);
      if (!vendor) return;
      // Skip pure script loads (we care about beacons/events)
      if (vendor === 'gtm' && /\.js/.test(url)) return;

      var parsed;
      if (vendor === 'ga4') parsed = parseGa4(url);
      else if (vendor === 'meta') parsed = parseMeta(url);
      else parsed = parseGeneric(url);

      // Try to pull the most recent dataLayer entry's push index — best-effort
      // root-cause hint for duplicate events.
      var dlIdx = null;
      var dl = window.dataLayer;
      if (dl && dl.length) {
        for (var i = dl.length - 1; i >= 0 && i >= dl.length - 5; i--) {
          if (dl[i] && dl[i].__g4f_push_idx) { dlIdx = dl[i].__g4f_push_idx; break; }
        }
      }

      send({
        vendor: vendor,
        eventName: parsed.eventName,
        clientId: parsed.clientId,
        params: parsed.params,
        pageUrl: location.href,
        rawUrl: url,
        method: method,
        dlPushIndex: dlIdx,
        source: window.google_tag_manager ? 'gtm' : 'unknown',
        ts: Date.now(),
      });
    } catch (e) {}
  }

  // --- monkey-patch the request APIs -------------------------------------------
  var _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url);
        if (url) record(url, 'fetch');
      } catch (e) {}
      return _fetch.apply(this, arguments);
    };
  }

  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__g4f_url = url;
    return _xhrOpen.apply(this, arguments);
  };
  var _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    try { if (this.__g4f_url) record(this.__g4f_url, 'xhr'); } catch (e) {}
    return _xhrSend.apply(this, arguments);
  };

  if (navigator.sendBeacon) {
    var _beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      try { record(url, 'beacon'); } catch (e) {}
      return _beacon(url, data);
    };
  }

  // Image beacons (pixel-based analytics like older Meta or Pinterest)
  try {
    var desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        get: desc.get,
        set: function (u) { try { record(u, 'image'); } catch (e) {} return desc.set.call(this, u); },
      });
    }
  } catch (e) {}

  // --- ad-blocker bait check ---------------------------------------------------
  // Load a well-known ad-related URL from a Google domain. If it fails to
  // resolve, an ad-blocker is present. We report this to the blocked endpoint
  // regardless — the customer sees the block rate even when nothing else fires.
  function checkAdBlocker() {
    var bait = document.createElement('script');
    bait.async = true;
    bait.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
    var timeout = setTimeout(function () {
      report('bait_timeout');
    }, 2500);
    bait.onload = function () { clearTimeout(timeout); };
    bait.onerror = function () {
      clearTimeout(timeout);
      report('bait_blocked');
    };
    try { document.head.appendChild(bait); } catch (e) {}

    function report(method) {
      try {
        var body = JSON.stringify({
          apiKey: API_KEY,
          method: method,
          pageUrl: location.href,
          userAgent: navigator.userAgent,
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(BLOCKED, new Blob([body], { type: 'application/json' }));
        } else {
          fetch(BLOCKED, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(function () {});
        }
      } catch (e) {}
    }
  }

  // Run after a short delay so we don't compete with real analytics loads
  setTimeout(checkAdBlocker, 800);

  // --- expose a manual trigger for pages that want to force flush --------------
  window.__g4f.flush = flush;
})();
