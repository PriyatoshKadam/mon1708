/*!
 * GA4Fix Monitor
 * v4.0
 *
 * Detects:
 *  - GA4
 *  - Google Ads
 *  - Meta Pixel
 *  - TikTok Pixel
 *  - LinkedIn
 *  - Pinterest
 *  - Snapchat
 *  - Reddit
 *  - Twitter/X
 *  - Hotjar
 *  - Microsoft Clarity
 *  - Mixpanel
 *  - Amplitude
 *  - Segment
 *  - HubSpot
 *  - Klaviyo
 *  - Intercom
 *
 * Also monitors:
 *  - fetch
 *  - XMLHttpRequest
 *  - sendBeacon
 *  - image pixels
 *  - dataLayer pushes
 *
 * IMPORTANT:
 * This script must never interfere with the customer's website.
 */

(function () {

  'use strict';


  /* =========================================================
   * INSTALL GUARD
   * ========================================================= */

  var g =
    window.__g4f ||
    {};

  if (
    g.installed
  ) {
    return;
  }

  g.installed =
    true;

  g.r =
    true;

  window.__g4f =
    g;


  /* =========================================================
   * CONFIG
   * ========================================================= */

  var scriptTag =
    document.currentScript ||
    (function () {

      var scripts =
        document.getElementsByTagName(
          'script'
        );

      return scripts[
        scripts.length - 1
      ];

    })();


  if (
    !scriptTag ||
    !scriptTag.src
  ) {
    return;
  }


  var scriptUrl;

  try {

    scriptUrl =
      new URL(
        scriptTag.src
      );

  } catch (e) {

    return;

  }


  var API_KEY =
    scriptUrl.searchParams.get(
      'apiKey'
    ) ||
    g.k ||
    null;


  var GTM_ID =
    scriptUrl.searchParams.get(
      'gtmContainerId'
    ) ||
    g.c ||
    null;


  if (!API_KEY) {
    return;
  }


  var BASE =
    scriptUrl.origin;


  var INGEST =
    BASE +
    '/api/ingest';


  var BLOCKED =
    BASE +
    '/api/blocked';


  /* =========================================================
   * DATA LAYER
   * ========================================================= */

  var dataLayer =
    window.dataLayer =
      window.dataLayer ||
      [];


  var dlPushIndex =
    0;


  var lastDataLayerEvent =
    null;


  /*
   * Preserve original push.
   */
  var originalDataLayerPush =
    dataLayer.push;


  dataLayer.push =
    function () {

      for (
        var i = 0;
        i < arguments.length;
        i++
      ) {

        try {

          var item =
            arguments[i];


          dlPushIndex++;


          if (
            item &&
            typeof item === 'object'
          ) {

            var eventName =
              item.event ||
              item.event_name ||
              item.eventName ||
              null;


            lastDataLayerEvent = {

              event:
                eventName,

              pushIndex:
                dlPushIndex,

              timestamp:
                Date.now(),

              item:
                item

            };

          }

        } catch (e) {}

      }


      return originalDataLayerPush.apply(
        this,
        arguments
      );

    };


  /*
   * Existing dataLayer entries.
   */
  try {

    for (
      var d = 0;
      d < dataLayer.length;
      d++
    ) {

      var existing =
        dataLayer[d];

      dlPushIndex++;

      if (
        existing &&
        typeof existing === 'object'
      ) {

        var existingEvent =
          existing.event ||
          existing.event_name ||
          existing.eventName ||
          null;

        if (
          existingEvent
        ) {

          lastDataLayerEvent = {

            event:
              existingEvent,

            pushIndex:
              dlPushIndex,

            timestamp:
              Date.now(),

            item:
              existing

          };

        }

      }

    }

  } catch (e) {}


  function getRecentDataLayerEvent() {

    if (
      !lastDataLayerEvent
    ) {
      return null;
    }


    /*
     * Only associate a network request
     * with a very recent dataLayer event.
     */
    if (
      Date.now() -
      lastDataLayerEvent.timestamp
      >
      2000
    ) {
      return null;
    }


    return lastDataLayerEvent;

  }


  /* =========================================================
   * URL HELPERS
   * ========================================================= */

  function safeUrl(
    value
  ) {

    try {

      if (!value) {
        return null;
      }

      if (
        value instanceof URL
      ) {
        return value;
      }

      return new URL(
        String(value),
        location.href
      );

    } catch (e) {

      return null;

    }

  }


  function safePageUrl() {

    try {

      var url =
        new URL(
          location.href
        );


      /*
       * Never store OAuth hash.
       */
      url.hash =
        '';


      /*
       * Remove sensitive parameters.
       */
      var sensitive =
        [
          'access_token',
          'refresh_token',
          'id_token',
          'token',
          'code',
          'authorization',
          'client_secret',
          'secret'
        ];


      sensitive.forEach(
        function (key) {

          url.searchParams.delete(
            key
          );

        }
      );


      return url.toString();

    } catch (e) {

      return (
        location.origin +
        location.pathname
      );

    }

  }


  function extractQueryParams(
    url
  ) {

    var params =
      {};


    try {

      var u =
        safeUrl(
          url
        );


      if (!u) {
        return params;
      }


      u.searchParams.forEach(
        function (
          value,
          key
        ) {

          params[key] =
            value;

        }
      );

    } catch (e) {}


    return params;

  }


  function parseBody(
    body
  ) {

    var params =
      {};


    if (!body) {
      return params;
    }


    /*
     * URLSearchParams
     */
    try {

      var search =
        new URLSearchParams(
          body
        );


      search.forEach(
        function (
          value,
          key
        ) {

          params[key] =
            value;

        }
      );


      if (
        Object.keys(
          params
        ).length
      ) {

        return params;

      }

    } catch (e) {}


    /*
     * JSON
     */
    try {

      var parsed =
        typeof body === 'string'
          ? JSON.parse(body)
          : body;


      if (
        parsed &&
        typeof parsed === 'object'
      ) {

        Object.keys(
          parsed
        ).forEach(
          function (key) {

            var value =
              parsed[key];


            if (
              typeof value ===
                'string' ||
              typeof value ===
                'number' ||
              typeof value ===
                'boolean'
            ) {

              params[key] =
                String(value);

            }

          }
        );

      }

    } catch (e) {}


    return params;

  }


  /* =========================================================
   * VENDOR DETECTION
   * ========================================================= */

  var VENDORS = [

    /*
     * GA4
     */
    {
      name:
        'ga4',

      re:
        /google-analytics\.com\/(?:g|mp)\/collect/i
    },

    {
      name:
        'ga4',

      re:
        /analytics\.google\.com\/g\/collect/i
    },

    {
      name:
        'ga4',

      re:
        /\/metrics\/g\/collect(?:\?|$)/i
    },


    /*
     * Google Ads
     */
    {
      name:
        'gads',

      re:
        /googleadservices\.com\/pagead\/(?:conversion|1p-conversion)/i
    },

    {
      name:
        'gads',

      re:
        /google\.com\/pagead\/(?:conversion|1p-conversion)/i
    },


    /*
     * Meta
     */
    {
      name:
        'meta',

      re:
        /facebook\.com\/tr/i
    },

    {
      name:
        'meta',

      re:
        /facebook\.net\/tr/i
    },

    {
      name:
        'meta',

      re:
        /connect\.facebook\.net/i
    },


    /*
     * TikTok
     */
    {
      name:
        'tiktok',

      re:
        /analytics\.tiktok\.com/i
    },

    {
      name:
        'tiktok',

      re:
        /business-api\.tiktok\.com/i
    },

    {
      name:
        'tiktok',

      re:
        /analytics\.tiktok\.com\/api/i
    },


    /*
     * LinkedIn
     */
    {
      name:
        'linkedin',

      re:
        /snap\.licdn\.com/i
    },

    {
      name:
        'linkedin',

      re:
        /px\.ads\.linkedin\.com/i
    },


    /*
     * Pinterest
     */
    {
      name:
        'pinterest',

      re:
        /ct\.pinterest\.com/i
    },


    /*
     * Snapchat
     */
    {
      name:
        'snapchat',

      re:
        /sc-static\.net\/scevent/i
    },

    {
      name:
        'snapchat',

      re:
        /tr\.snapchat\.com/i
    },


    /*
     * Reddit
     */
    {
      name:
        'reddit',

      re:
        /events\.redditmedia\.com/i
    },

    {
      name:
        'reddit',

      re:
        /redditstatic\.com\/ads/i
    },


    /*
     * Twitter/X
     */
    {
      name:
        'twitter',

      re:
        /ads-twitter\.com/i
    },

    {
      name:
        'twitter',

      re:
        /analytics\.twitter\.com/i
    },


    /*
     * Hotjar
     */
    {
      name:
        'hotjar',

      re:
        /hotjar\.com/i
    },


    /*
     * Clarity
     */
    {
      name:
        'clarity',

      re:
        /clarity\.ms/i
    },


    /*
     * Mixpanel
     */
    {
      name:
        'mixpanel',

      re:
        /api\.mixpanel\.com/i
    },


    /*
     * Amplitude
     */
    {
      name:
        'amplitude',

      re:
        /amplitude\.com/i
    },


    /*
     * Segment
     */
    {
      name:
        'segment',

      re:
        /segment\.(io|com)/i
    },


    /*
     * HubSpot
     */
    {
      name:
        'hubspot',

      re:
        /hs-scripts\.com/i
    },

    {
      name:
        'hubspot',

      re:
        /hubspot\.(com|net)/i
    },


    /*
     * Klaviyo
     */
    {
      name:
        'klaviyo',

      re:
        /klaviyo\.com/i
    },


    /*
     * Intercom
     */
    {
      name:
        'intercom',

      re:
        /intercom\.(io|com)/i
    }

  ];


  function isGA4MeasurementId(
    value
  ) {

    return (
      typeof value ===
        'string' &&
      /^G-[A-Z0-9]+$/i.test(
        value
      )
    );

  }


  function detectVendor(
    url,
    params
  ) {

    if (!url) {
      return null;
    }


    /*
     * Native endpoints.
     */
    for (
      var i = 0;
      i < VENDORS.length;
      i++
    ) {

      try {

        if (
          VENDORS[i].re.test(
            url
          )
        ) {

          return VENDORS[i].name;

        }

      } catch (e) {}

    }


    /*
     * First-party GA4.
     */
    try {

      var tid =
        params.tid ||
        params.measurement_id ||
        params.measurementId;


      var en =
        params.en ||
        params.event ||
        params.event_name;


      if (
        isGA4MeasurementId(
          tid
        ) &&
        en
      ) {

        return 'ga4';

      }

    } catch (e) {}


    return null;

  }


  /* =========================================================
   * EVENT PARSERS
   * ========================================================= */

  function parseGA4(
    url,
    body
  ) {

    var params =
      extractQueryParams(
        url
      );


    var bodyParams =
      parseBody(
        body
      );


    Object.keys(
      bodyParams
    ).forEach(
      function (key) {

        params[key] =
          bodyParams[key];

      }
    );


    /*
     * Convert:
     *
     * ep.currency
     * ep.value
     * ep.transaction_id
     *
     * to:
     *
     * currency
     * value
     * transaction_id
     */
    Object.keys(
      params
    ).forEach(
      function (key) {

        if (
          key.indexOf(
            'ep.'
          ) === 0 ||
          key.indexOf(
            'epn.'
          ) === 0
        ) {

          var clean =
            key.substring(
              key.indexOf('.') +
              1
            );


          if (
            params[clean] ==
              null
          ) {

            params[clean] =
              params[key];

          }

        }

      }
    );


    return {

      eventName:
        params.en ||
        params.event ||
        params.event_name ||
        null,

      clientId:
        params.cid ||
        params.client_id ||
        params.uid ||
        null,

      measurementId:
        params.tid ||
        params.measurement_id ||
        null,

      params:
        params

    };

  }


  function parseMeta(
    url,
    body
  ) {

    var params =
      extractQueryParams(
        url
      );


    var bodyParams =
      parseBody(
        body
      );


    Object.keys(
      bodyParams
    ).forEach(
      function (key) {

        params[key] =
          bodyParams[key];

      }
    );


    return {

      eventName:
        params.ev ||
        params.event ||
        null,

      clientId:
        params.id ||
        params.fbp ||
        null,

      params:
        params

    };

  }


  function parseGeneric(
    url,
    body
  ) {

    var params =
      extractQueryParams(
        url
      );


    var bodyParams =
      parseBody(
        body
      );


    Object.keys(
      bodyParams
    ).forEach(
      function (key) {

        params[key] =
          bodyParams[key];

      }
    );


    return {

      eventName:
        params.en ||
        params.ev ||
        params.event ||
        params.event_name ||
        params.eventName ||
        null,

      clientId:
        params.cid ||
        params.client_id ||
        params.id ||
        null,

      params:
        params

    };

  }


  /* =========================================================
   * SOURCE DETECTION
   * ========================================================= */

  function detectSource(
    method
  ) {

    /*
     * Do NOT simply check:
     *
     * window.google_tag_manager
     *
     * because GTM existing on the page does not prove
     * that THIS request came from GTM.
     */


    var recent =
      getRecentDataLayerEvent();


    if (
      recent &&
      recent.event
    ) {

      return 'gtm';

    }


    /*
     * There is no reliable way to distinguish
     * a direct gtag() request from arbitrary fetch/XHR
     * solely from the network layer.
     *
     * Therefore don't falsely call it gtag_direct.
     */
    if (
      method === 'beacon'
    ) {

      return 'beacon';

    }

    if (
      method === 'image'
    ) {

      return 'pixel';

    }

    if (
      method === 'fetch'
    ) {

      return 'fetch';

    }

    if (
      method === 'xhr'
    ) {

      return 'xhr';

    }

    return 'direct';

  }


  /* =========================================================
   * EVENT NAME FROM DATALAYER
   * ========================================================= */

  function getDataLayerEventName() {

    var recent =
      getRecentDataLayerEvent();


    if (!recent) {
      return null;
    }


    return (
      recent.event ||
      null
    );

  }


  /* =========================================================
   * QUEUE
   * ========================================================= */

  var queue =
    g.q ||
    [];

  var flushTimer =
    null;


  function send(
    payload
  ) {

    queue.push(
      payload
    );


    if (
      flushTimer
    ) {
      return;
    }


    flushTimer =
      setTimeout(
        flush,
        400
      );

  }


  /* =========================================================
   * FLUSH
   * ========================================================= */

  function flush() {

    flushTimer =
      null;


    if (
      !queue.length
    ) {
      return;
    }


    var batch =
      queue.splice(
        0,
        queue.length
      );


    var body =
      JSON.stringify({

        apiKey:
          API_KEY,

        gtmContainerId:
          GTM_ID,

        events:
          batch

      });


    /*
     * sendBeacon
     */
    try {

      if (
        navigator.sendBeacon
      ) {

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


  /* =========================================================
   * RECORD
   * ========================================================= */

  function record(
    url,
    method,
    body
  ) {

    try {

      if (!url) {
        return;
      }


      var absolute =
        safeUrl(
          url
        );


      if (!absolute) {
        return;
      }


      var absoluteUrl =
        absolute.href;


      /*
       * Don't monitor our own requests.
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


      var params =
        extractQueryParams(
          absoluteUrl
        );


      var bodyParams =
        parseBody(
          body
        );


      Object.keys(
        bodyParams
      ).forEach(
        function (key) {

          params[key] =
            bodyParams[key];

        }
      );


      var vendor =
        detectVendor(
          absoluteUrl,
          params
        );


      if (!vendor) {
        return;
      }


      /*
       * Don't record GTM JavaScript itself.
       */
      if (
        vendor === 'gtm' &&
        /\.js(?:\?|$)/i.test(
          absoluteUrl
        )
      ) {

        return;
      }


      var parsed;


      if (
        vendor === 'ga4'
      ) {

        parsed =
          parseGA4(
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


      var eventName =
        parsed.eventName ||
        getDataLayerEventName() ||
        null;


      var dlEvent =
        getRecentDataLayerEvent();


      var source =
        detectSource(
          method
        );


      /*
       * IMPORTANT:
       *
       * Use the actual recent dataLayer push
       * only when it is recent.
       */
      var pushIndex =
        dlEvent
          ? dlEvent.pushIndex
          : null;


      send({

        vendor:
          vendor,

        eventName:
          eventName,

        clientId:
          parsed.clientId ||
          null,

        measurementId:
          parsed.measurementId ||
          params.tid ||
          null,

        params:
          parsed.params ||
          params ||
          {},

        pageUrl:
          safePageUrl(),

        rawUrl:
          absoluteUrl,

        method:
          method,

        dlPushIndex:
          pushIndex,

        source:
          source,

        ts:
          Date.now()

      });

    } catch (e) {

      /*
       * Never break customer's website.
       */

    }

  }


  /* =========================================================
   * FETCH INTERCEPTION
   * ========================================================= */

  var originalFetch =
    window.fetch;


  if (
    originalFetch
  ) {

    window.fetch =
      function (
        input,
        init
      ) {

        try {

          var url =
            typeof input ===
              'string'
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


          if (
            url
          ) {

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


  /* =========================================================
   * XHR INTERCEPTION
   * ========================================================= */

  var originalOpen =
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


      return originalOpen.apply(
        this,
        arguments
      );

    };


  var originalSend =
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


      return originalSend.apply(
        this,
        arguments
      );

    };


  /* =========================================================
   * SEND BEACON
   * ========================================================= */

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
            typeof data ===
              'string'
              ? data
              : data instanceof Blob
                ? null
                : data;


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


  /* =========================================================
   * IMAGE PIXELS
   * ========================================================= */

  try {

    var imageDescriptor =
      Object.getOwnPropertyDescriptor(
        HTMLImageElement.prototype,
        'src'
      );


    if (
      imageDescriptor &&
      imageDescriptor.set
    ) {

      Object.defineProperty(
        HTMLImageElement.prototype,
        'src',
        {

          configurable:
            true,

          get:
            imageDescriptor.get,

          set:
            function (
              url
            ) {

              try {

                record(
                  url,
                  'image',
                  null
                );

              } catch (e) {}


              return imageDescriptor.set.call(
                this,
                url
              );

            }

        }
      );

    }

  } catch (e) {}


  /* =========================================================
   * SCRIPT / BAIT AD-BLOCK DETECTION
   * ========================================================= */

  var blockedReported =
    false;


  function reportBlocked(
    method
  ) {

    if (
      blockedReported
    ) {
      return;
    }


    blockedReported =
      true;


    try {

      var payload =
        JSON.stringify({

          apiKey:
            API_KEY,

          method:
            method ||
            'script_error',

          pageUrl:
            safePageUrl()

        });


      /*
       * Use GET-style beacon URL.
       *
       * This avoids unnecessary CORS
       * preflight for adblock reporting.
       */
      var url =
        BLOCKED +
        '?k=' +
        encodeURIComponent(
          API_KEY
        ) +
        '&m=' +
        encodeURIComponent(
          method ||
          'script_error'
        );


      if (
        navigator.sendBeacon
      ) {

        navigator.sendBeacon(
          url,
          ''
        );

      } else {

        fetch(
          url,
          {
            method:
              'GET',

            credentials:
              'omit',

            keepalive:
              true
          }
        ).catch(
          function () {}
        );

      }

    } catch (e) {}

  }


  function checkAdBlocker() {

    try {

      var bait =
        document.createElement(
          'div'
        );


      bait.className =
        'adsbox ad-banner adsbygoogle';


      bait.style.position =
        'absolute';

      bait.style.left =
        '-9999px';

      bait.style.width =
        '1px';

      bait.style.height =
        '1px';


      document.body.appendChild(
        bait
      );


      setTimeout(
        function () {

          try {

            var blocked =
              bait.offsetHeight === 0 ||
              bait.offsetWidth === 0;


            if (
              blocked
            ) {

              reportBlocked(
                'bait_blocked'
              );

            }


            if (
              bait.parentNode
            ) {

              bait.parentNode.removeChild(
                bait
              );

            }

          } catch (e) {}

        },
        100
      );

    } catch (e) {}

  }


  /* =========================================================
   * INITIALIZE
   * ========================================================= */

  try {

    if (
      document.body
    ) {

      setTimeout(
        checkAdBlocker,
        1500
      );

    } else {

      window.addEventListener(
        'DOMContentLoaded',
        function () {

          setTimeout(
            checkAdBlocker,
            1500
          );

        }
      );

    }

  } catch (e) {}


  /*
   * Flush when page is leaving.
   */
  window.addEventListener(
    'pagehide',
    flush
  );


  window.addEventListener(
    'beforeunload',
    flush
  );


  /*
   * Expose useful debugging information.
   */
  g.version =
    '4.0';

  g.apiKey =
    API_KEY;

  g.gtmContainerId =
    GTM_ID;

})();
