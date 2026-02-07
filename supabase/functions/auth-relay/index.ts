/**
 * Auth Relay Edge Function
 *
 * Bridges the gap between GoTrue's HTTPS-only redirect and the mobile app's
 * custom scheme deep link (exp:// or cold-email-ninja://).
 *
 * GoTrue v2.2.12 uses EXACT string matching for redirect URL validation and
 * rejects non-HTTP schemes. This relay receives the HTTPS redirect with tokens
 * in the URL fragment, then client-side JavaScript reads the fragment and
 * redirects to the app's deep link.
 *
 * The app's deep link URL is passed via the `redirect` query parameter which
 * is preserved through the GoTrue redirect (fragments are appended AFTER the
 * full URL including query string).
 *
 * No JWT verification needed — this is a public redirect endpoint.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req: Request) => {
  // Serve a minimal HTML page that reads tokens from the URL fragment
  // and redirects to the app's deep link.
  // The `redirect` query param tells us which deep link to use.
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signing in...</title>
  <style>
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .container { text-align: center; }
    .spinner {
      width: 40px; height: 40px; margin: 0 auto 16px;
      border: 3px solid #1e293b; border-top-color: #3b82f6;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Redirecting to app...</p>
  </div>
  <script>
    (function() {
      var hash = window.location.hash;
      var params = new URLSearchParams(window.location.search);
      var redirect = params.get('redirect') || '';

      // Validate scheme
      if (!redirect.startsWith('exp://') && !redirect.startsWith('cold-email-ninja://')) {
        document.querySelector('p').textContent = 'Invalid redirect. Please try again in the app.';
        return;
      }

      if (hash) {
        // Convert fragment params to query params because Android deep links
        // drop URL fragments. GoTrue sends tokens as #access_token=...
        var tokenParams = hash.substring(1); // remove leading #
        var separator = redirect.indexOf('?') >= 0 ? '&' : '?';
        window.location.href = redirect + separator + tokenParams;
      } else {
        document.querySelector('p').textContent = 'Authentication failed. Please try again in the app.';
      }
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
