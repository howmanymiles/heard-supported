// The Content Security Policy: scripts only from this site, and only with the nonce for this response.

export function csp(nonce: string, dev = process.env.NODE_ENV !== 'production') {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-inline'" : ''}`,
    "style-src-attr 'unsafe-inline'",          // style="" attributes for layout; they cannot run code
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self' blob:",                  // document previews
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self' https://login.microsoftonline.com",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}
