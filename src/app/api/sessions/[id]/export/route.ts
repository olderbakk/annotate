import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

function describeX(xPct: number): string {
  return xPct < 33 ? 'left side' : xPct < 66 ? 'center' : 'right side'
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: session }, { data: comments }] = await Promise.all([
    supabase.from('sessions').select().eq('id', id).single(),
    supabase.from('comments').select().eq('session_id', id).order('created_at', { ascending: true }),
  ])

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = comments ?? []
  const open = rows.filter(c => !c.resolved)
  const resolved = rows.filter(c => c.resolved)

  const lines: string[] = [
    `# Feedback: ${session.name}`,
    `**Site:** ${session.url}`,
    `**Exported:** ${new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `**Open:** ${open.length}  |  **Resolved:** ${resolved.length}`,
    '',
    '---',
    '',
    '## Open comments',
    '',
  ]

  function formatComment(c: Record<string, unknown>, i: number, strike = false) {
    const author = strike ? `~~${c.author}~~` : String(c.author)
    const pageUrl = c.page_url
      ? String(c.page_url)
      : (() => { try { return new URL(String(c.page_path), session.url).href } catch { return String(c.page_path) } })()
    const yPx = c.y_abs_px != null ? `${Math.round(Number(c.y_abs_px))}px from top` : `${Number(c.y_percent ?? 0).toFixed(1)}% from top`
    const xDesc = describeX(Number(c.x_percent))
    const date = new Date(String(c.created_at)).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })

    lines.push(
      `### ${i + 1}. ${author}`,
      `**Page:** ${pageUrl}`,
      `**Position:** ${xDesc}, ${yPx}`,
      `**Date:** ${date}`,
      '',
      String(c.text),
      '',
      '---',
      '',
    )
  }

  if (open.length === 0) {
    lines.push('_No open comments._', '')
  } else {
    open.forEach((c, i) => formatComment(c, i))
  }

  if (resolved.length > 0) {
    lines.push('## Resolved', '')
    resolved.forEach((c, i) => formatComment(c, i, true))
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="feedback-${session.name.toLowerCase().replace(/\s+/g, '-')}.md"`,
    },
  })
}
