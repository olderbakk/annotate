import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('comments')
    .select()
    .eq('session_id', session_id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { session_id, page_path, page_url, x_percent, y_abs_px, y_percent, page_height_px, viewport_width_px, text, author } = body

  if (!session_id || x_percent == null || y_abs_px == null || !text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('comments')
    .insert({
      session_id,
      page_path: page_path || '/',
      page_url: page_url || null,
      x_percent,
      y_abs_px,
      y_percent: y_percent ?? 0,
      page_height_px: page_height_px ?? 0,
      viewport_width_px: viewport_width_px ?? 0,
      text,
      author: author || 'Anonymous',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
