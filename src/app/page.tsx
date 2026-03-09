'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Home() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    let cleanUrl = url.trim()
    if (!cleanUrl) return
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl

    setLoading(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Untitled review', url: cleanUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/review/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <span className="text-sm font-medium tracking-wide" style={{ color: 'var(--text)' }}>
              annotate
            </span>
          </div>
          <Link href="/projects" className="text-xs" style={{ color: 'var(--text-muted)' }}>
            All projects
          </Link>
        </div>

        <h1 className="text-2xl font-semibold mb-1 tracking-tight" style={{ color: 'var(--text)' }}>
          Start a review
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Enter a URL to open it with annotation tools.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
              Project name
            </label>
            <input
              type="text"
              placeholder="Homepage review"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-all"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
              Website URL
            </label>
            <input
              type="text"
              placeholder="example.com"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-all"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--accent)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40 cursor-pointer"
            style={{ backgroundColor: 'var(--text)', color: 'var(--bg)' }}
          >
            {loading ? 'Opening…' : 'Open for review'}
          </button>
        </form>
      </div>
    </div>
  )
}
