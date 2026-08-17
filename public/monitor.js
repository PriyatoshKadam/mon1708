/*!
 * GA4Fix monitor.js v3.0
 *
 * Real-user tag & event monitoring for:
 * GA4
 * Google Ads
 * Meta
 * TikTok
 * LinkedIn
 * Pinterest
 * Twitter/X
 * Reddit
 * Snapchat
 * Hotjar
 * Microsoft Clarity
 * Mixpanel
 * Amplitude
 * Segment
 * HubSpot
 * Klaviyo
 * Intercom
 *
 * Supports:
 * - Native vendor endpoints
 * - First-party/proxied GA4 endpoints
 * - GA4 tid + en detection
 * - fetch
 * - XHR
 * - sendBeacon
 * - image pixels
 * - dataLayer monitoring
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // INSTALL GUARD
  // ---------------------------------------------------------------------------

  var g = window.__g4f || {};

  if (g.installed) {
    return;
  }

  g.installed = true;
  g.r = true;

  window.__g4f = g;


  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------

  var scriptTag =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  if (!scriptTag || !scriptTag.src) {
    return;
  }

  var scriptUrl;

  try {
    scriptUrl = new URL(scriptTag.src);
  } catch (e) {
    return;
  }

  var API_KEY =
    scriptUrl.searchParams.get('apiKey') ||
    g.k ||
    null;

  var GTM_ID =
    scriptUrl.searchParams.get('gtmContainerId') ||
    g.c ||
    null;

  /*
   * Use the same origin that served monitor.js.
   *
   * Example:
   *
   * https://monitoring.example.com/monitor.js
   *
   * becomes:
   *
   * https://monitoring.example.com/api/ingest
   */

  var BASE = scriptUrl.origin;

  var INGEST = BASE + '/api/ingest';
  var BLOCKED = BASE + '/api/blocked';


  // ---------------------------------------------------------------------------
  // VENDOR DEFINITIONS
  // ---------------------------------------------------------------------------

  var VENDORS = [

    // -------------------------------------------------------------------------
    // GA4
    // -------------------------------------------------------------------------

    {
      name: 'ga4',

      re:
        /google-analytics\.com\/(?:g|mp)\/collect/i
    },

    {
      name: 'ga4',

      re:
        /analytics\.google\.com\/g\/collect/i
    },

    /*
     * First-party GA4 proxy.
     *
     * Example:
     *
     * https://dev-app.gafix.ai/metrics/g/collect
     */

    {
      name: 'ga4',

      re:
        /\/metrics\/g\/collect(?:\?|$)/i
    },


    // -------------------------------------------------------------------------
    // Google Ads
    // -------------------------------------------------------------------------

    {
      name: 'gads',

      re:
        /googleadservices\.com\/pagead\/(?:conversion|1p-conversion)/i
    },

    {
      name: 'gads',

      re:
        /google\.com\/pagead\/(?:conversion|1p-conversion)/i
    },


    // -------------------------------------------------------------------------
    // Google Tag Manager / gtag
    // -------------------------------------------------------------------------

    {
      name: 'gtm',

      re:
        /googletagmanager\.com\/(?:gtm|gtag)\.js/i
    },


    // -------------------------------------------------------------------------
    // Meta
    // -------------------------------------------------------------------------

    {
      name: 'meta',

      re:
        /facebook\.com\/tr/i
    },

    {
      name: 'meta',

      re:
        /connect\.facebook\.net/i
    },

    {
      name: 'meta',

      re:
        /facebook\.net\/tr/i
    },


    // -------------------------------------------------------------------------
    // TikTok
    // -------------------------------------------------------------------------

    {
      name: 'tiktok',

      re:
        /analytics\.tiktok\.com/i
    },

    {
      name: 'tiktok',

      re:
        /business-api\.tiktok\.com/i
    },


    // -------------------------------------------------------------------------
    // LinkedIn
    // -------------------------------------------------------------------------

    {
      name: 'linkedin',

      re:
        /snap\.licdn\.com/i
    },

    {
      name: 'linkedin',

      re:
        /px\.ads\.linkedin\.com/i
    },


    // -------------------------------------------------------------------------
    // Pinterest
    // -------------------------------------------------------------------------

    {
      name: 'pinterest',

      re:
        /ct\.pinterest\.com/i
    },


    // -------------------------------------------------------------------------
    // Twitter / X
    // -------------------------------------------------------------------------

    {
      name: 'twitter',

      re:
        /ads-twitter\.com/i
    },

    {
      name: 'twitter',

      re:
        /analytics\.twitter\.com/i
    },

    {
      name: 'twitter',

      re:
        /t\.co\/i\/adsct/i
    },


    // -------------------------------------------------------------------------
    // Reddit
    // -------------------------------------------------------------------------

    {
      name: 'reddit',

      re:
        /redditstatic\.com\/ads/i
    },

    {
      name: 'reddit',

      re:
        /events\.redditmedia\.com/i
    },


    // -------------------------------------------------------------------------
    // Snapchat
    // -------------------------------------------------------------------------

    {
      name: 'snapchat',

      re:
        /sc-static\.net\/scevent/i
    },

    {
      name: 'snapchat',

      re:
        /tr\.snapchat\.com/i
    },


    // -------------------------------------------------------------------------
    // Hotjar
    // -------------------------------------------------------------------------

    {
      name: 'hotjar',

      re:
        /hotjar\.com/i
    },


    // -------------------------------------------------------------------------
    // Microsoft Clarity
    // -------------------------------------------------------------------------

    {
      name: 'clarity',

      re:
        /clarity\.ms/i
    },


    // -------------------------------------------------------------------------
    // Mixpanel
    // -------------------------------------------------------------------------

    {
      name: 'mixpanel',

      re:
        /api\.mixpanel\.com/i
    },


    // -------------------------------------------------------------------------
    // Amplitude
    // -------------------------------------------------------------------------

    {
      name: 'amplitude',

      re:
        /amplitude\.com/i
    },


    // -------------------------------------------------------------------------
    // Segment
    // -------------------------------------------------------------------------

    {
      name: 'segment',

      re:
        /segment\.(io|com)/i
    },


    // -------------------------------------------------------------------------
    // HubSpot
    // -------------------------------------------------------------------------

    {
      name: 'hubspot',

      re:
        /hs-scripts\.com/i
    },

    {
      name: 'hubspot',

      re:
        /hubspot\.com/i
    },

    {
      name: 'hubspot',

      re:
        /hubspot\.net/i
    },


    // -------------------------------------------------------------------------
    // Klaviyo
    // -------------------------------------------------------------------------

    {
      name: 'klaviyo',

      re:
        /klaviyo\.com/i
    },


    // -------------------------------------------------------------------------
    // Intercom
    // -------------------------------------------------------------------------

    {
      name: 'intercom',

      re:
        /intercom\.io/i
    },

    {
      name: 'intercom',

      re:
        /intercom\.com/i
    }
  ];


  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  function safeUrl(value) {
    try {
      if (!value) {
        return null;
      }

      if (value instanceof URL) {
        return value;
      }

      return new URL(String(value), location.href);
    } catch (e) {
      return null;
    }
  }


  function objectToParams(obj) {
    var params = {};

    if (!obj || typeof obj !== 'object') {
      return params;
    }

    Object.keys(obj).forEach(function (key) {
      try {
        var value = obj[key];

        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          params[key] = String(value);
        }
      } catch (e) {}
    });

    return params;
  }


  function extractQueryParams(url) {
    var params = {};

    try {
      var u = safeUrl(url);

      if (!u) {
        return params;
      }

      u.searchParams.forEach(function (value, key) {
        params[key] = value;
      });
    } catch (e) {}

    return params;
  }


  function isGA4MeasurementId(value) {
    return (
      typeof value === 'string' &&
      /^G-[A-Z0-9]+$/i.test(value)
    );
  }


  // ---------------------------------------------------------------------------
  // VENDOR DETECTION
  // ---------------------------------------------------------------------------

  function detectVendor(url, params) {

    if (!url) {
      return null;
    }


    // -------------------------------------------------------------------------
    // 1. Native endpoint detection
    // -------------------------------------------------------------------------

    for (var i = 0; i < VENDORS.length; i++) {

      try {

        if (VENDORS[i].re.test(url)) {

          return VENDORS[i].name;

        }

      } catch (e) {}

    }


    // -------------------------------------------------------------------------
    // 2. GA4 first-party/proxy detection
    //
    // This is the important part for:
    //
    // /metrics/g/collect
    //
    // or any custom proxy endpoint where the URL itself doesn't contain
    // google-analytics.com.
    // -------------------------------------------------------------------------

    try {

      var tid =
        params &&
        (
          params.tid ||
          params.measurement_id ||
          params.measurementId
        );

      var eventName =
        params &&
        (
          params.en ||
          params.event ||
          params.event_name
        );


      if (
        isGA4MeasurementId(tid) &&
        eventName
      ) {

        return 'ga4';

      }

    } catch (e) {}


    return null;
  }


  // ---------------------------------------------------------------------------
  // EVENT NAME EXTRACTION
  // ---------------------------------------------------------------------------

  function getEventName(params) {

    if (!params) {
      return null;
    }


    // GA4
    if (params.en) {
      return params.en;
    }


    // Meta
    if (params.ev) {
      return params.ev;
    }


    // Generic analytics
    if (params.event) {
      return params.event;
    }


    if (params.event_name) {
      return params.event_name;
    }


    if (params.eventName) {
      return params.eventName;
    }


    return null;
  }


  // ---------------------------------------------------------------------------
  // GA4 PARSER
  // ---------------------------------------------------------------------------

  function parseGa4(url, body) {

    var params = extractQueryParams(url);


    /*
     * If GA4 request data is in the POST body rather than URL,
     * merge it.
     */

    if (body) {

      try {

        var bodyParams = new URLSearchParams(body);

        bodyParams.forEach(function (value, key) {

          params[key] = value;

        });

      } catch (e) {

        try {

          var jsonBody = JSON.parse(body);

          var jsonParams = objectToParams(jsonBody);

          Object.keys(jsonParams).forEach(function (key) {

            params[key] = jsonParams[key];

          });

        } catch (ignore) {}

      }

    }


    /*
     * GA4 event name
     */

    var eventName =
      params.en ||
      params.event ||
      params.event_name ||
      null;


    /*
     * GA4 client ID
     */

    var clientId =
      params.cid ||
      params._p ||
      params.uid ||
      null;


    /*
     * Measurement ID
     */

    var measurementId =
      params.tid ||
      params.measurement_id ||
      null;


    /*
     * Lift GA4 event parameters:
     *
     * ep.currency -> currency
     * ep.value    -> value
     *
     * epn.value   -> value
     */

    Object.keys(params).forEach(function (key) {

      if (
        key.indexOf('ep.') === 0 ||
        key.indexOf('epn.') === 0
      ) {

        var cleanKey =
          key.substring(
            key.indexOf('.') + 1
          );

        if (params[cleanKey] == null) {

          params[cleanKey] = params[key];

        }

      }

    });


    return {

      eventName: eventName,

      clientId: clientId,

      measurementId: measurementId,

      params: params

    };

  }


  // ---------------------------------------------------------------------------
  // META PARSER
  // ---------------------------------------------------------------------------

  function parseMeta(url, body) {

    var params = extractQueryParams(url);


    if (body) {

      try {

        var bodyParams = new URLSearchParams(body);

        bodyParams.forEach(function (value, key) {

          params[key] = value;

        });

      } catch (e) {}

    }


    return {

      eventName:
        params.ev ||
        params.event ||
        null,

      clientId:
        params.id ||
        null,

      params: params

    };

  }


  // ---------------------------------------------------------------------------
  // GENERIC PARSER
  // ---------------------------------------------------------------------------

  function parseGeneric(url, body) {

    var params = extractQueryParams(url);


    if (body) {

      try {

        var bodyParams = new URLSearchParams(body);

        bodyParams.forEach(function (value, key) {

          params[key] = value;

        });

      } catch (e) {

        try {

          var jsonBody = JSON.parse(body);

          var jsonParams = objectToParams(jsonBody);

          Object.keys(jsonParams).forEach(function (key) {

            params[key] = jsonParams[key];

          });

        } catch (ignore) {}

      }

    }


    return {

      eventName: getEventName(params),

      clientId:
        params.cid ||
        params.client_id ||
        params.id ||
        null,

      params: params

    };

  }


  // ---------------------------------------------------------------------------
  // SOURCE DETECTION
  // ---------------------------------------------------------------------------

  function detectSource(url, method) {

    try {

      /*
       * If a GTM event can be associated with the current dataLayer push,
       * we mark it as GTM.
       */

      if (
        window.google_tag_manager &&
        window.dataLayer &&
        window.dataLayer.length
      ) {

        return 'gtm';

      }


      if (method === 'beacon') {
        return 'beacon';
      }


      if (method === 'image') {
        return 'pixel';
      }


      if (method === 'fetch') {
        return 'fetch';
      }


      if (method === 'xhr') {
        return 'xhr';
      }


      return 'direct';

    } catch (e) {

      return 'unknown';

    }

  }


  // ---------------------------------------------------------------------------
  // DATALAYER MONITORING
  // ---------------------------------------------------------------------------

  window.dataLayer = window.dataLayer || [];

  var pushIndex = 0;

  /*
   * Existing dataLayer entries.
   */

  try {

    for (
      var existingIndex = 0;
      existingIndex < window.dataLayer.length;
      existingIndex++
    ) {

      var existingEvent =
        window.dataLayer[existingIndex];

      if (
        existingEvent &&
        typeof existingEvent === 'object'
      ) {

        pushIndex++;

        try {

          Object.defineProperty(
            existingEvent,
            '__g4f_push_idx',
            {
              value: pushIndex,
              writable: false,
              enumerable: false
            }
          );

          Object.defineProperty(
            existingEvent,
            '__g4f_ts',
            {
              value: Date.now(),
              writable: false,
              enumerable: false
            }
          );

        } catch (e) {}

      }

    }

  } catch (e) {}


  /*
   * Patch dataLayer.push.
   */

  var originalPush =
    window.dataLayer.push;

  window.dataLayer.push =
    function () {

      for (
        var i = 0;
        i < arguments.length;
        i++
      ) {

        var evt =
          arguments[i];


        if (
          evt &&
          typeof evt === 'object'
        ) {

          pushIndex++;


          try {

            Object.defineProperty(
              evt,
              '__g4f_push_idx',
              {
                value: pushIndex,
                writable: false,
                enumerable: false
              }
            );


            Object.defineProperty(
              evt,
              '__g4f_ts',
              {
                value: Date.now(),
                writable: false,
                enumerable: false
              }
            );

          } catch (e) {

            try {

              evt.__g4f_push_idx =
                pushIndex;

              evt.__g4f_ts =
                Date.now();

            } catch (ignore) {}

          }

        }

      }


      return originalPush.apply(
        this,
        arguments
      );

    };


  // ---------------------------------------------------------------------------
  // FIND MOST RECENT DATALAYER PUSH
  // ---------------------------------------------------------------------------

  function getRecentDataLayerEvent() {

    var dl =
      window.dataLayer;

    if (
      !dl ||
      !dl.length
    ) {

      return null;

    }


    for (
      var i = dl.length - 1;
      i >= 0 &&
      i >= dl.length - 10;
      i--
    ) {

      var item =
        dl[i];


      if (
        item &&
        typeof item === 'object'
      ) {

        return item;

      }

    }


    return null;

  }


  // ---------------------------------------------------------------------------
  // GET DATALAYER PUSH INDEX
  // ---------------------------------------------------------------------------

  function getDataLayerPushIndex() {

    var item =
      getRecentDataLayerEvent();

    if (
      item &&
      item.__g4f_push_idx
    ) {

      return item.__g4f_push_idx;

    }

    return null;

  }


  // ---------------------------------------------------------------------------
  // GET DATALAYER EVENT NAME
  // ---------------------------------------------------------------------------

  function getDataLayerEventName() {

    var item =
      getRecentDataLayerEvent();

    if (!item) {
      return null;
    }


    return (
      item.event ||
      item.event_name ||
      item.eventName ||
      null
    );

  }


  // ---------------------------------------------------------------------------
  // EVENT QUEUE
  // ---------------------------------------------------------------------------

  var queue =
    g.q || [];

  var flushTimer =
    null;


  // ---------------------------------------------------------------------------
  // SEND / QUEUE
  // ---------------------------------------------------------------------------

  function send(payload) {

    queue.push(payload);


    if (flushTimer) {
      return;
    }


    flushTimer =
      setTimeout(
        flush,
        400
      );

  }


  // ---------------------------------------------------------------------------
  // FLUSH
  // ---------------------------------------------------------------------------

  function flush() {

    flushTimer =
      null;


    if (!queue.length) {
      return;
    }


    var batch =
      queue.splice(
        0,
        queue.length
      );


    var body =
      JSON.stringify({

        apiKey: API_KEY,

        gtmContainerId:
          GTM_ID,

        events:
          batch

      });


    /*
     * sendBeacon
     */

    try {

      if (navigator.sendBeacon) {

        var blob =
          new Blob(
            [body],
            {
              type:
                'application/json'
            }
          );


        var sent =
          navigator.sendBeacon(
            INGEST,
            blob
          );


        if (sent) {
          return;
        }

      }

    } catch (e) {}


    /*
     * fetch fallback
     */

    try {

      fetch(
        INGEST,
        {
          method:
            'POST',

          body:
            body,

          keepalive:
            true,

          headers:
            {
              'Content-Type':
                'application/json'
            },

          credentials:
            'omit'
        }
      ).catch(
        function () {}
      );

    } catch (e) {}

  }


  // ---------------------------------------------------------------------------
  // PAGE EXIT
  // ---------------------------------------------------------------------------

  window.addEventListener(
    'pagehide',
    flush
  );

  window.addEventListener(
    'beforeunload',
    flush
  );


  // ---------------------------------------------------------------------------
  // RECORD EVENT
  // ---------------------------------------------------------------------------

  function record(
    url,
    method,
    body
  ) {

    try {

      if (!url) {
        return;
      }


      /*
       * Normalize URL
       */

      var absoluteUrl;

      try {

        absoluteUrl =
          new URL(
            String(url),
            location.href
          ).href;

      } catch (e) {

        return;

      }


      /*
       * Never monitor our own API calls.
       */

      if (
        absoluteUrl.indexOf(
          INGEST
        ) === 0 ||

        absoluteUrl.indexOf(
          BLOCKED
        ) === 0
      ) {

        return;

      }


      /*
       * Get query params first.
       */

      var queryParams =
        extractQueryParams(
          absoluteUrl
        );


      /*
       * Detect vendor.
       */

      var vendor =
        detectVendor(
          absoluteUrl,
          queryParams
        );


      /*
       * Unknown requests are ignored.
       */

      if (!vendor) {
        return;
      }


      /*
       * Ignore GTM JavaScript loading.
       */

      if (
        vendor === 'gtm' &&
        /\.js(?:\?|$)/i.test(
          absoluteUrl
        )
      ) {

        return;

      }


      /*
       * Parse according to vendor.
       */

      var parsed;


      if (
        vendor === 'ga4'
      ) {

        parsed =
          parseGa4(
            absoluteUrl,
            body
          );

      }

      else if (
        vendor === 'meta'
      ) {

        parsed =
          parseMeta(
            absoluteUrl,
            body
          );

      }

      else {

        parsed =
          parseGeneric(
            absoluteUrl,
            body
          );

      }


      /*
       * If no event name was available, still capture the request
       * for vendor detection, but mark eventName null.
       */

      var eventName =
        parsed.eventName ||
        getDataLayerEventName() ||
        null;


      /*
       * Client ID.
       */

      var clientId =
        parsed.clientId ||
        null;


      /*
       * Measurement ID.
       */

      var measurementId =
        parsed.measurementId ||
        queryParams.tid ||
        null;


      /*
       * DataLayer information.
       */

      var dlIdx =
        getDataLayerPushIndex();


      /*
       * Source.
       */

      var source =
        detectSource(
          absoluteUrl,
          method
        );


      /*
       * Send event.
       */

      send({

        vendor:
          vendor,

        eventName:
          eventName,

        clientId:
          clientId,

        measurementId:
          measurementId,

        params:
          parsed.params || {},

        pageUrl:
          location.href,

        rawUrl:
          absoluteUrl,

        method:
          method,

        dlPushIndex:
          dlIdx,

        source:
          source,

        ts:
          Date.now()

      });

    } catch (e) {

      /*
       * Monitoring must NEVER break the customer's website.
       */

    }

  }


  // ---------------------------------------------------------------------------
  // FETCH INTERCEPTION
  // ---------------------------------------------------------------------------

  var originalFetch =
    window.fetch;


  if (originalFetch) {

    window.fetch =
      function (
        input,
        init
      ) {

        try {

          var url =
            typeof input === 'string'
              ? input
              : (
                  input &&
                  input.url
                );


          var body =
            init &&
            init.body
              ? init.body
              : null;


          if (url) {

            record(
              url,
              'fetch',
              body
            );

          }

        } catch (e) {}


        return originalFetch.apply(
          this,
          arguments
        );

      };

  }


  // ---------------------------------------------------------------------------
  // XHR INTERCEPTION
  // ---------------------------------------------------------------------------

  var originalXHROpen =
    XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open =
    function (
      method,
      url
    ) {

      try {

        this.__g4f_method =
          method;

        this.__g4f_url =
          url;

      } catch (e) {}


      return originalXHROpen.apply(
        this,
        arguments
      );

    };


  var originalXHRSend =
    XMLHttpRequest.prototype.send;


  XMLHttpRequest.prototype.send =
    function (
      body
    ) {

      try {

        if (
          this.__g4f_url
        ) {

          record(
            this.__g4f_url,
            'xhr',
            body
          );

        }

      } catch (e) {}


      return originalXHRSend.apply(
        this,
        arguments
      );

    };


  // ---------------------------------------------------------------------------
  // SEND BEACON INTERCEPTION
  // ---------------------------------------------------------------------------

  if (
    navigator.sendBeacon
  ) {

    var originalBeacon =
      navigator.sendBeacon.bind(
        navigator
      );


    navigator.sendBeacon =
      function (
        url,
        data
      ) {

        try {

          var body =
            typeof data === 'string'
              ? data
              : null;


          record(
            url,
            'beacon',
            body
          );

        } catch (e) {}


        return originalBeacon(
          url,
          data
        );

      };

  }


  // ---------------------------------------------------------------------------
  // IMAGE PIXEL INTERCEPTION
  // ---------------------------------------------------------------------------

  try {

    var imageSrcDescriptor =
      Object.getOwnPropertyDescriptor(
        HTMLImageElement.prototype,
        'src'
      );


    if (
      imageSrcDescriptor &&
      imageSrcDescriptor.set
    ) {

      Object.defineProperty(
        HTMLImageElement.prototype,
        'src',
        {

          configurable:
            true,

          get:
            imageSrcDescriptor.get,

          set:
            function (url) {

              try {

                record(
                  url,
                  'image',
                  null
                );

              } catch (e) {}


              return imageSrcDescriptor.set.call(
                this,
                url
              );

            }

        }
      );

    }

  } catch (e) {}


  // ---------------------------------------------------------------------------
  // DATALAYER DIRECT EVENT CAPTURE
  // ---------------------------------------------------------------------------

  /*
   * This captures platform-independent events directly from dataLayer.
   *
   * Example:
   *
   * dataLayer.push({
   *   event: 'purchase',
   *   ecommerce: {...}
   * });
   *
   * This is useful even when a platform request is delayed.
   */

  function captureDataLayerEvent(
    evt
  ) {

    try {

      if (
        !evt ||
        typeof evt !== 'object'
      ) {

        return;

      }


      var eventName =
        evt.event ||
        evt.event_name ||
        evt.eventName;


      if (!eventName) {
        return;
      }


      /*
       * Don't send internal GTM events.
       */

      if (
        String(eventName)
          .toLowerCase()
          .indexOf('gtm.') === 0
      ) {

        return;

      }


      send({

        vendor:
          'dataLayer',

        eventName:
          eventName,

        clientId:
          null,

        measurementId:
          null,

        params:
          evt,

        pageUrl:
          location.href,

        rawUrl:
          location.href,

        method:
          'dataLayer',

        dlPushIndex:
          evt.__g4f_push_idx ||
          null,

        source:
          'dataLayer',

        ts:
          Date.now()

      });

    } catch (e) {}

  }


  /*
   * Update dataLayer.push wrapper to capture actual events.
   */

  var wrappedPush =
    window.dataLayer.push;


  window.dataLayer.push =
    function () {

      for (
        var i = 0;
        i < arguments.length;
        i++
      ) {

        try {

          captureDataLayerEvent(
            arguments[i]
          );

        } catch (e) {}

      }


      return wrappedPush.apply(
        this,
        arguments
      );

    };


  // ---------------------------------------------------------------------------
  // AD BLOCKER DETECTION
  // ---------------------------------------------------------------------------

  function checkAdBlocker() {

    var bait =
      document.createElement(
        'script'
      );


    bait.async =
      true;


    bait.src =
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';


    var timeout =
      setTimeout(
        function () {

          reportBlocked(
            'bait_timeout'
          );

        },
        2500
      );


    bait.onload =
      function () {

        clearTimeout(
          timeout
        );

      };


    bait.onerror =
      function () {

        clearTimeout(
          timeout
        );


        reportBlocked(
          'bait_blocked'
        );

      };


    try {

      document.head.appendChild(
        bait
      );

    } catch (e) {}


    function reportBlocked(
      method
    ) {

      try {

        var body =
          JSON.stringify({

            apiKey:
              API_KEY,

            method:
              method,

            pageUrl:
              location.href,

            userAgent:
              navigator.userAgent

          });


        if (
          navigator.sendBeacon
        ) {

          navigator.sendBeacon(
            BLOCKED,
            new Blob(
              [body],
              {
                type:
                  'application/json'
              }
            )
          );

        } else {

          fetch(
            BLOCKED,
            {

              method:
                'POST',

              body:
                body,

              keepalive:
                true,

              headers:
                {
                  'Content-Type':
                    'application/json'
                },

              credentials:
                'omit'

            }
          ).catch(
            function () {}
          );

        }

      } catch (e) {}

    }

  }


  // ---------------------------------------------------------------------------
  // START AD BLOCKER CHECK
  // ---------------------------------------------------------------------------

  setTimeout(
    checkAdBlocker,
    800
  );


  // ---------------------------------------------------------------------------
  // MANUAL FLUSH
  // ---------------------------------------------------------------------------

  window.__g4f.flush =
    flush;


  // ---------------------------------------------------------------------------
  // DEBUG API
  // ---------------------------------------------------------------------------

  /*
   * Open console and run:
   *
   * __g4f.debug()
   *
   */

  window.__g4f.debug =
    function () {

      return {

        apiKey:
          API_KEY,

        gtmContainerId:
          GTM_ID,

        ingest:
          INGEST,

        blocked:
          BLOCKED,

        dataLayerLength:
          window.dataLayer
            ? window.dataLayer.length
            : 0,

        queueLength:
          queue.length,

        lastDataLayerEvent:
          getRecentDataLayerEvent(),

        lastDataLayerEventName:
          getDataLayerEventName(),

        vendorPatterns:
          VENDORS.map(
            function (v) {
              return v.name;
            }
          )

      };

    };


})();
