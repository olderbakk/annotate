export interface Session {
  id: string
  name: string
  url: string
  created_at: string
}

export interface Comment {
  id: string
  session_id: string
  page_path: string
  x_percent: number
  y_percent: number
  text: string
  author: string
  resolved: boolean
  created_at: string
}
