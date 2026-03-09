export interface Session {
  id: string
  name: string
  url: string
  created_at: string
}

export interface Comment {
  id: string
  session_id: string
  page_path: string        // e.g. "/about"
  page_url: string         // e.g. "https://example.com/about"
  x_percent: number        // x as % of viewport width
  y_abs_px: number         // absolute y in pixels from page top (the source of truth)
  y_percent: number        // legacy fallback
  page_height_px: number   // page height when comment was placed (for context)
  viewport_width_px: number
  text: string
  author: string
  resolved: boolean
  created_at: string
}
