function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods':
      'GET, POST, OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type',

    /*
     * REQUIRED because navigator.sendBeacon()
     * is sending a credentialed cross-origin request.
     */
    'Access-Control-Allow-Credentials':
      'true',

    'Access-Control-Max-Age':
      '86400',

    'Vary':
      'Origin',
  };

  /*
   * Never use:
   *
   * Access-Control-Allow-Origin: *
   *
   * together with credentials.
   */
  if (origin) {
    headers['Access-Control-Allow-Origin'] =
      origin;
  }

  return headers;
}
