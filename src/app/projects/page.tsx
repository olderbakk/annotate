import { createServiceClient } from '@/lib/supabase'
import Link from 'next/link'

export const revalidate = 0

export default async function ProjectsPage() {
  const supabase = createServiceClient()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*, comments(count)')
    .order('created_at', { ascending: false })

  const rows = (sessions ?? []) as Array<{
    id: string
    name: string
    url: string
    created_at: string
    comments: { count: number }[]
  }>

  return (
    <div className="min-h-screen px-6 py-12" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>annotate</span>
          </div>
          <Link
            href="/"
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ backgroundColor: 'var(--text)', color: 'var(--bg)' }}
          >
            New review
          </Link>
        </div>

        <h1 className="text-xl font-semibold mb-1 tracking-tight" style={{ color: 'var(--text)' }}>
          Projects
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          {rows.length} review {rows.length === 1 ? 'session' : 'sessions'}
        </p>

        {rows.length === 0 ? (
          <div
            className="rounded-xl px-6 py-12 text-center"
            style={{ border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No projects yet.</p>
            <Link
              href="/"
              className="inline-block mt-3 text-xs"
              style={{ color: 'var(--accent)' }}
            >
              Start your first review
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map(session => {
              const commentCount = session.comments?.[0]?.count ?? 0
              let hostname = ''
              try { hostname = new URL(session.url).hostname } catch {}

              return (
                <Link
                  key={session.id}
                  href={`/review/${session.id}`}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl transition-colors group"
                  style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold"
                      style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
                    >
                      {session.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {session.name}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {hostname}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    {commentCount > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(session.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
