import { NextRequest, NextResponse } from 'next/server'

const INJECTED_SCRIPT = `
<script>
(function () {
  function send(extra) {
    try {
      window.parent.postMessage(Object.assign({
        __annotate: true,
        scrollY: window.scrollY,
        pageHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        href: location.href,
      }, extra || {}), '*');
    } catch(e) {}
  }
  window.addEventListener('scroll', function () { send({ event: 'scroll' }); }, { passive: true });
  window.addEventListener('resize', function () { send({ event: 'resize' }); });
  setInterval(function () { send({ event: 'tick' }); }, 400);
  send({ event: 'load' });
})();
</script>`

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

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
    return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 502 })
  }

  const contentType = upstream.headers.get('content-type') ?? ''

  if (!contentType.includes('text/html')) {
    // Pass through non-HTML resources (images, fonts, etc.)
    const body = await upstream.arrayBuffer()
    return new Response(body, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
    })
  }

  let html = await upstream.text()
  const origin = new URL(url).origin

  // Inject <base> so relative URLs resolve correctly
  const baseTag = `<base href="${origin}/">`
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>${baseTag}`)
  } else {
    html = baseTag + html
  }

  // Inject scroll-tracking script before </head>
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${INJECTED_SCRIPT}</head>`)
  } else {
    html = html + INJECTED_SCRIPT
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Cache-Control': 'no-store',
    },
  })
}
