import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

function describePosition(xPct: number, yPct: number): string {
  const xLabel = xPct < 33 ? 'left' : xPct < 66 ? 'center' : 'right'
  const yLabel = yPct < 25 ? 'top' : yPct < 50 ? 'upper half' : yPct < 75 ? 'lower half' : 'bottom'
  return `${yLabel}, ${xLabel}`
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
    `**URL:** ${session.url}`,
    `**Exported:** ${new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `**Open comments:** ${open.length}  |  **Resolved:** ${resolved.length}`,
    '',
    '---',
    '',
    '## Open comments',
    '',
  ]

  if (open.length === 0) {
    lines.push('_No open comments._', '')
  } else {
    open.forEach((c, i) => {
      lines.push(
        `### ${i + 1}. ${c.author}`,
        `**Location:** ${describePosition(c.x_percent, c.y_percent)} (x: ${c.x_percent.toFixed(1)}%, y: ${c.y_percent.toFixed(1)}% from top of page)`,
        `**Page:** ${(() => { try { return new URL(c.page_path, session.url).href } catch { return c.page_path } })()}`,
        `**Date:** ${new Date(c.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        '',
        c.text,
        '',
        '---',
        '',
      )
    })
  }

  if (resolved.length > 0) {
    lines.push('## Resolved comments', '')
    resolved.forEach((c, i) => {
      lines.push(
        `### ${i + 1}. ~~${c.author}~~`,
        `**Location:** ${describePosition(c.x_percent, c.y_percent)}`,
        '',
        c.text,
        '',
        '---',
        '',
      )
    })
  }

  const markdown = lines.join('\n')

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="feedback-${session.name.toLowerCase().replace(/\s+/g, '-')}.md"`,
    },
  })
}
