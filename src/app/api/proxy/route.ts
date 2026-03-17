import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new Response('Missing url', { status: 400 })

  // Forward browser headers to the upstream so RSC requests, auth cookies, etc. work.
  // Strip hop-by-hop and Vercel-internal headers that must not be forwarded.
  const skip = new Set([
    'host', 'origin', 'referer', 'x-forwarded-for', 'x-forwarded-host',
    'x-forwarded-proto', 'x-real-ip', 'x-vercel-id', 'x-vercel-deployment-url',
    'x-vercel-forwarded-for', 'cf-connecting-ip', 'cf-ray', 'cf-visitor',
    'connection', 'transfer-encoding', 'te', 'trailer', 'upgrade',
  ])
  const upstreamHeaders: Record<string, string> = {}
  for (const [k, v] of req.headers.entries()) {
    if (!skip.has(k.toLowerCase())) upstreamHeaders[k] = v
  }
  // Ensure a browser-like UA is present
  if (!upstreamHeaders['user-agent']) {
    upstreamHeaders['user-agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120'
  }
  // Set Referer to the target origin so Next.js CSRF checks pass
  const parsedTarget = new URL(url)
  upstreamHeaders['referer'] = parsedTarget.origin + '/'

  let upstream: Response
  try {
    upstream = await fetch(url, { headers: upstreamHeaders, redirect: 'follow' })
  } catch (err) {
    return errorPage(url, String(err))
  }

  const contentType = upstream.headers.get('content-type') ?? ''

  // Pass non-HTML resources through with CORS headers so the
  // intercepted fetch() calls inside the iframe work correctly.
  if (!contentType.includes('text/html')) {
    const body = await upstream.arrayBuffer()
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      },
    })
  }

  let html = await upstream.text()
  const parsedUrl = new URL(url)
  const targetOrigin = parsedUrl.origin

  // <base> makes relative asset URLs (CSS, images, fonts) resolve to the original site.
  // Must come before any other tags.
  const baseTag = `<base href="${targetOrigin}/">`

  const proxyOrigin = req.nextUrl.origin
  const script = buildScript(url, targetOrigin, proxyOrigin)

  // Inject <base> + script at the very start of <head> so our fetch/XHR/history
  // patches run before any site JS (including Next.js bundle) captures native references.
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${script}`)
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}${script}</head>`)
  } else {
    html = baseTag + script + html
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Cache-Control': 'no-store',
    },
  })
}

export async function POST(req: NextRequest) {
  // Forward POST requests (form submissions, API calls) to the target
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new Response('Missing url', { status: 400 })

  const body = await req.arrayBuffer()
  const upstream = await fetch(url, {
    method: 'POST',
    headers: Object.fromEntries(
      [...req.headers.entries()].filter(([k]) =>
        !['host', 'origin', 'referer', 'x-forwarded-for'].includes(k)
      )
    ),
    body,
  }).catch(() => null)

  if (!upstream) return new Response('Upstream error', { status: 502 })

  const respBody = await upstream.arrayBuffer()
  return new Response(respBody, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

// ─── Injected script ─────────────────────────────────────────────────────────
//
// This runs inside the proxied iframe and does four things:
//  1. Reports scrollY / pageHeight / realUrl to parent via postMessage
//  2. Intercepts history.pushState / replaceState for SPA navigation
//  3. Intercepts <a> clicks for traditional MPA navigation
//  4. Intercepts fetch() and XHR so same-origin API calls hit our proxy,
//     not annotate-two.vercel.app
//
function buildScript(realUrl: string, targetOrigin: string, proxyOrigin: string): string {
  return `<script>
(function () {
  'use strict';
  var REAL_URL = ${JSON.stringify(realUrl)};
  var TARGET_ORIGIN = ${JSON.stringify(targetOrigin)};
  // Use absolute URL so the <base> tag doesn't redirect proxy calls to the target origin.
  var PROXY_BASE = ${JSON.stringify(proxyOrigin + '/api/proxy?url=')};

  // ── 1. Reporting ───────────────────────────────────────────────────────────
  function send(extra) {
    try {
      window.parent.postMessage(Object.assign({
        __annotate: true,
        scrollY: window.scrollY,
        pageHeight: Math.max(
          document.body ? document.body.scrollHeight : 0,
          document.documentElement.scrollHeight
        ),
        realUrl: REAL_URL,
      }, extra || {}), '*');
    } catch (_) {}
  }

  window.addEventListener('scroll', function () { send({ event: 'scroll' }); }, { passive: true });
  window.addEventListener('resize', function () { send({ event: 'resize' }); });
  setInterval(function () { send({ event: 'tick' }); }, 300);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { send({ event: 'load' }); });
  } else {
    send({ event: 'load' });
  }

  // ── 2. SPA navigation: history API ─────────────────────────────────────────
  function onSpaNavigate(rawUrl) {
    try {
      var resolved = new URL(String(rawUrl), REAL_URL);
      // Only track navigations to the TARGET site.
      // Ignore pushState/replaceState calls that point to the proxy domain
      // (e.g. Next.js calls replaceState(state, '', location.href) during hydration,
      // which is the proxy URL — annotate-two.vercel.app/api/proxy?url=...).
      if (resolved.origin !== TARGET_ORIGIN) return;
      // Also ignore paths that look like our own proxy route resolved onto the target.
      if (resolved.pathname.startsWith('/api/proxy')) return;
      REAL_URL = resolved.href;
      send({ event: 'navigate' });
    } catch (_) {}
  }

  function safeHistoryUrl(u) {
    if (!u) return u;
    try {
      var p = new URL(String(u), REAL_URL);
      // Browser blocks pushState/replaceState with URLs from a different origin
      // than the document. Convert to path-only so the call succeeds.
      if (p.origin !== location.origin) {
        return p.pathname + p.search + p.hash;
      }
    } catch (_) {}
    return u;
  }

  var _pushState = history.pushState.bind(history);
  var _replaceState = history.replaceState.bind(history);

  history.pushState = function (state, title, u) {
    try { _pushState(state, title, safeHistoryUrl(u)); } catch (_) {}
    if (u) onSpaNavigate(u);
  };
  history.replaceState = function (state, title, u) {
    try { _replaceState(state, title, safeHistoryUrl(u)); } catch (_) {}
    if (u) onSpaNavigate(u);
  };
  // For browser back/forward: reconstruct real URL from the proxy-domain path.
  window.addEventListener('popstate', function () {
    try {
      REAL_URL = new URL(location.pathname + location.search + location.hash, TARGET_ORIGIN).href;
      send({ event: 'navigate' });
    } catch (_) {}
  });

  // ── 3. MPA navigation: <a> click interception ──────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript:') ||
        href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      var abs = new URL(href, REAL_URL).href;
      if (new URL(abs).origin === TARGET_ORIGIN) {
        e.preventDefault();
        // Ask the parent frame to navigate the iframe so React keeps its src
        // state in sync — avoids currentUrl drifting out of sync.
        window.parent.postMessage({
          __annotate: true,
          __navigateTo: PROXY_BASE + encodeURIComponent(abs),
          realUrl: abs,
          scrollY: 0,
          pageHeight: 0,
        }, '*');
      }
    } catch (_) {}
  }, true);

  // ── 4. fetch() + XHR interception ──────────────────────────────────────────
  // Same-origin API calls (e.g. Next.js data fetching, REST APIs) would hit
  // annotate-two.vercel.app instead of the target site. Rewrite them to go
  // through our proxy, which forwards them and adds CORS headers.

  function rewriteUrl(u) {
    if (!u) return u;
    try {
      var str = (u instanceof Request) ? u.url : String(u);
      // Resolve relative to REAL_URL so plain paths like '/tiltak?_rsc=…' resolve
      // to the target origin rather than the proxy domain.
      var parsed = new URL(str, REAL_URL);

      // Skip URLs already going through our proxy.
      if (parsed.pathname.startsWith('/api/proxy')) return u;

      // Case 1 – explicit target-origin URL (absolute or relative resolved via REAL_URL).
      if (parsed.origin === TARGET_ORIGIN) {
        return PROXY_BASE + encodeURIComponent(parsed.href);
      }

      // Case 2 – URL resolved to the proxy domain.
      // This happens because the browser resolves Request URLs and fetch() relative
      // paths against location.href (annotate-two.vercel.app), not REAL_URL.
      // Exclude our own API routes (/api/comments, /api/sessions, etc.).
      if (parsed.origin === location.origin && !parsed.pathname.startsWith('/api/')) {
        var targetUrl = TARGET_ORIGIN + parsed.pathname + parsed.search + parsed.hash;
        return PROXY_BASE + encodeURIComponent(targetUrl);
      }
    } catch (_) {}
    return u;
  }

  // fetch
  var _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input, init) {
      try {
        if (input instanceof Request) {
          var rewritten = rewriteUrl(input.url);
          if (rewritten !== input.url) {
            input = new Request(rewritten, input);
          }
        } else {
          input = rewriteUrl(input);
        }
      } catch (_) {}
      return _fetch.call(window, input, init);
    };
  }

  // XMLHttpRequest
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    var args = Array.prototype.slice.call(arguments);
    try { args[1] = rewriteUrl(args[1]); } catch (_) {}
    return _xhrOpen.apply(this, args);
  };

  // ── 5. scroll-to commands from parent ──────────────────────────────────────
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__annotateCommand === 'scrollTo') {
      window.scrollTo({ top: e.data.y, behavior: 'smooth' });
    }
  });

})();
</script>`
}

function errorPage(url: string, reason: string): Response {
  return new Response(
    `<html><body style="font-family:-apple-system,sans-serif;padding:3rem;color:#666;max-width:480px;margin:auto">
      <p style="font-size:1.1rem;color:#333">Could not load this page</p>
      <p><strong>${url}</strong></p>
      <p style="font-size:.85rem">${reason}</p>
      <p style="font-size:.85rem">The site may block server-side requests, require authentication, or be offline.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
