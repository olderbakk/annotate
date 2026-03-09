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

  // Use <base> so relative assets (CSS, images, JS) resolve against original origin
  const baseTag = `<base href="${origin}/">`

  // Injected script:
  // - Tracks scroll and page height, reports to parent via postMessage
  // - Sends the REAL URL (not the proxy URL)
  // - Intercepts link clicks to route through proxy so navigation stays proxied
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

  // Intercept link clicks so navigation stays in proxy
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript:') ||
        href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      var abs = new URL(href, REAL_URL).href;
      // Only intercept same-origin links
      if (new URL(abs).origin === new URL(REAL_URL).origin) {
        e.preventDefault();
        window.location.href = PROXY_BASE + encodeURIComponent(abs);
      }
    } catch (err) {}
  }, true);

  // Listen for scroll commands from parent
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__annotateCommand === 'scrollTo') {
      window.scrollTo({ top: e.data.y, behavior: 'smooth' });
    }
  });

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
