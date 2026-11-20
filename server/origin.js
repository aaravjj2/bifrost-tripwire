export function permitsRequest(req, origin, pathname) {
  // Opening the public UI from a link is a normal cross-site navigation.
  // Session/data APIs and every mutation retain the stricter origin boundary.
  if (['GET', 'HEAD'].includes(req.method) && !pathname.startsWith('/api/')) return true;
  return (!req.headers.origin || req.headers.origin === origin) && req.headers['sec-fetch-site'] !== 'cross-site';
}
