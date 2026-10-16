/**
 * Content Security Policy of the pages: only scripts carrying this
 * request's nonce run (and those they load, e.g. Vercel Analytics), so
 * injected code cannot. 'unsafe-inline' is only for very old browsers that
 * know no nonces (so the hint in lib/legacy.ts still shows there); every
 * browser that knows them ignores it. Styles stay allowed inline (React's style
 * attributes); everything else comes from the app's own origin. The service
 * worker needs `worker-src`, because 'strict-dynamic' ignores 'self' for
 * scripts.
 */
export function contentSecurityPolicy(nonce: string, dev = false) {
  return [
    "default-src 'self'",
    // React needs eval in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
