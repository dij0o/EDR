# Web security hardening

The web response uses a per-request Nginx request ID as the CSP nonce. Nginx
places the same value in the CSP header and the `csp-nonce` meta element. The
React entry point passes it to Emotion so Material UI style elements receive
the approved nonce. Inline style elements are not allowed. `style-src-attr`
remains explicitly enabled for React and chart SVG presentation attributes;
this is narrower than allowing every inline style element.

COOP, COEP, CORP, Permissions-Policy, HSTS, frame, MIME-sniffing, and referrer
headers are applied by the frontend Nginx service. Technology version tokens
are suppressed by Nginx and both Express services.

The `__Host-edr_csrf` cookie intentionally is not HttpOnly because the
double-submit-cookie mechanism requires the web client to read it and echo it
in `X-CSRF-Token`. The value is a random CSRF secret, not an authentication
credential. It is restricted by the `__Host-` prefix, `Secure`,
`SameSite=Strict`, and `Path=/`. Access and refresh cookies remain HttpOnly.
