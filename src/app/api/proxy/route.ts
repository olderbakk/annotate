import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new Response('Missing url', { status: 400 })

  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
    })
  } catch {
    return new Response(`<html><body style="font-family:sans-serif;padding:2rem;color:#666">
      <p>Could not load <strong>${url}</strong></p>
      <p>The site may block external requests or require authentication.</p>
    </body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  const contentType = upstream.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    const body = await upstream.arrayBuffer()
    return new Response(body, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
    })
  }

  let html = await upstream.text()
  const parsedUrl = new URL(url)
  const origin = parsedUrl.origin

  // <base> makes relative assets (CSS, images, fonts) resolve against the original origin
  const baseTag = `<base href="${origin}/">`

  const script = `<script>
(function () {
  var REAL_URL = ${JSON.stringify(url)};
  var PROXY_BASE = '/api/proxy?url=';

  function send(extra) {
    try {
      window.parent.postMessage(Object.assign({
        __annotate: true,
        scrollY: window.scrollY,
        pageHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        realUrl: REAL_URL,
      }, extra || {}), '*');
    } catch (e) {}
  }

  // ── SPA navigation: intercept history.pushState / replaceState ──────────────
  // Modern sites (Next.js, Nuxt, SvelteKit, etc.) use the History API for
  // client-side routing. We patch these so we always know the real current URL
  // without needing to reload through the proxy.
  function onSpaNavigate(newUrl) {
    try {
      REAL_URL = new URL(newUrl, REAL_URL).href;
      send({ event: 'navigate' });
    } catch (e) {}
  }

  var _pushState = history.pushState.bind(history);
  var _replaceState = history.replaceState.bind(history);

  // When the proxied site calls pushState/replaceState with an absolute URL to
  // its own domain (e.g. "https://example.com/about"), the browser throws a
  // SecurityError because the document origin is annotate-two.vercel.app.
  // Fix: strip absolute URLs down to just their path before passing to the
  // real history API. REAL_URL still gets updated with the full URL.
  function safeHistoryUrl(url) {
    if (!url) return url;
    try {
      var parsed = new URL(String(url), REAL_URL);
      if (parsed.origin !== location.origin) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (e) {}
    return url;
  }

  history.pushState = function (state, title, url) {
    try { _pushState(state, title, safeHistoryUrl(url)); } catch (e) {}
    if (url) onSpaNavigate(String(url));
  };
  history.replaceState = function (state, title, url) {
    try { _replaceState(state, title, safeHistoryUrl(url)); } catch (e) {}
    if (url) onSpaNavigate(String(url));
  };

  window.addEventListener('popstate', function () {
    onSpaNavigate(location.href);
  });

  // ── MPA navigation: intercept <a> clicks for traditional page loads ─────────
  // For sites that do full page reloads on link clicks, we redirect through
  // the proxy so our script stays alive on the next page.
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript:') ||
        href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      var abs = new URL(href, REAL_URL).href;
      if (new URL(abs).origin === new URL(REAL_URL).origin) {
        e.preventDefault();
        window.location.href = PROXY_BASE + encodeURIComponent(abs);
      }
    } catch (err) {}
  }, true);

  // ── Scroll commands from parent ─────────────────────────────────────────────
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__annotateCommand === 'scrollTo') {
      window.scrollTo({ top: e.data.y, behavior: 'smooth' });
    }
  });

  // ── Reporting ───────────────────────────────────────────────────────────────
  window.addEventListener('scroll', function () { send({ event: 'scroll' }); }, { passive: true });
  window.addEventListener('resize', function () { send({ event: 'resize' }); });
  setInterval(function () { send({ event: 'tick' }); }, 300);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { send({ event: 'load' }); });
  } else {
    send({ event: 'load' });
  }
})();
</script>`

  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>${baseTag}`)
  } else {
    html = baseTag + html
  }

  if (html.includes('</head>')) {
    html = html.replace('</head>', `${script}</head>`)
  } else {
    html += script
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Cache-Control': 'no-store',
    },
  })
}
