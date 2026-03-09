'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Session, Comment } from '@/lib/types'
import CommentPin from '@/components/CommentPin'
import CommentSidebar from '@/components/CommentSidebar'
import CommentInput from '@/components/CommentInput'

interface PendingPin {
  xPct: number   // % of overlay width
  yAbsPct: number // % of total page height (absolute)
  screenYPct: number // % of overlay height (for rendering the input)
}

interface IframeState {
  scrollY: number
  pageHeight: number
}

type Mode = 'browse' | 'comment'

export default function ReviewClient({ session }: { session: Session }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [currentPath, setCurrentPath] = useState('/')
  const [copied, setCopied] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mode, setMode] = useState<Mode>('browse')
  const [iframe, setIframe] = useState<IframeState>({ scrollY: 0, pageHeight: 0 })
  const overlayRef = useRef<HTMLDivElement>(null)

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/comments?session_id=${session.id}`)
    const data = await res.json()
    if (Array.isArray(data)) setComments(data)
  }, [session.id])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // Listen for scroll/height updates from the proxied iframe
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data?.__annotate) return
      setIframe({ scrollY: e.data.scrollY ?? 0, pageHeight: e.data.pageHeight ?? 0 })
      if (e.data.href) {
        try {
          const path = new URL(e.data.href).pathname
          setCurrentPath(path)
        } catch {}
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (mode === 'browse') setPendingPin(null)
  }, [mode])

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== 'comment') return
    if (pendingPin) { setPendingPin(null); return }

    const rect = overlayRef.current!.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const screenYPct = ((e.clientY - rect.top) / rect.height) * 100

    // Convert viewport Y → absolute page Y (as % of total page height)
    const clickPx = (e.clientY - rect.top) + iframe.scrollY
    const pageH = iframe.pageHeight || rect.height
    const yAbsPct = (clickPx / pageH) * 100

    setPendingPin({ xPct, yAbsPct, screenYPct })
    setActiveCommentId(null)
  }

  async function handleSaveComment(text: string, author: string) {
    if (!pendingPin) return
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        page_path: currentPath,
        x_percent: pendingPin.xPct,
        y_percent: pendingPin.yAbsPct,
        text,
        author,
      }),
    })
    const comment = await res.json()
    setComments(prev => [...prev, comment])
    setPendingPin(null)
    setActiveCommentId(comment.id)
  }

  async function handleResolve(id: string, resolved: boolean) {
    await fetch(`/api/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    })
    setComments(prev => prev.map(c => c.id === id ? { ...c, resolved } : c))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/comments/${id}`, { method: 'DELETE' })
    setComments(prev => prev.filter(c => c.id !== id))
    if (activeCommentId === id) setActiveCommentId(null)
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Convert a comment's absolute y% back to viewport y%
  function toScreenYPct(yAbsPct: number): number | null {
    if (!overlayRef.current) return null
    const pageH = iframe.pageHeight || overlayRef.current.clientHeight
    const absPx = (yAbsPct / 100) * pageH
    const screenPx = absPx - iframe.scrollY
    const screenPct = (screenPx / overlayRef.current.clientHeight) * 100
    return screenPct
  }

  const pageComments = comments.filter(c => c.page_path === currentPath)
  const unresolvedCount = comments.filter(c => !c.resolved).length
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(session.url)}`

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-4 h-11 shrink-0 z-20"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>annotate</span>
          </div>
          <div className="w-px h-3" style={{ backgroundColor: 'var(--border)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{session.name}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {new URL(session.url).hostname}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div
            className="flex items-center rounded-md p-0.5 gap-0.5"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <button
              onClick={() => setMode('browse')}
              className="text-xs px-2.5 py-1 rounded transition-all cursor-pointer"
              style={{
                backgroundColor: mode === 'browse' ? 'var(--bg)' : 'transparent',
                color: mode === 'browse' ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: mode === 'browse' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Browse
            </button>
            <button
              onClick={() => setMode('comment')}
              className="text-xs px-2.5 py-1 rounded transition-all cursor-pointer"
              style={{
                backgroundColor: mode === 'comment' ? 'var(--bg)' : 'transparent',
                color: mode === 'comment' ? 'var(--accent)' : 'var(--text-muted)',
                boxShadow: mode === 'comment' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Comment
            </button>
          </div>

          {unresolvedCount > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              {unresolvedCount} open
            </span>
          )}
          <a
            href={`/api/sessions/${session.id}/export`}
            download
            className="text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            Export
          </a>
          <button
            onClick={copyShareLink}
            className="text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer"
            style={{
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              backgroundColor: copied ? 'var(--bg-secondary)' : 'transparent',
            }}
          >
            {copied ? 'Copied!' : 'Share link'}
          </button>
          <button
            onClick={() => setSidebarOpen(p => !p)}
            className="text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            {sidebarOpen ? 'Hide' : 'Comments'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Iframe area */}
        <div className="flex-1 relative overflow-hidden">
          <iframe
            src={proxyUrl}
            className="w-full h-full border-0"
            onLoad={() => setIframeLoaded(true)}
            title="Review target"
            style={{ pointerEvents: mode === 'browse' ? 'auto' : 'none' }}
          />

          {/* Overlay — captures clicks in comment mode, shows pins always */}
          {iframeLoaded && (
            <div
              ref={overlayRef}
              className="absolute inset-0"
              style={{
                cursor: mode === 'comment' ? 'crosshair' : 'default',
                pointerEvents: mode === 'comment' ? 'auto' : 'none',
              }}
              onClick={handleOverlayClick}
            >
              {/* Placed pins — repositioned based on current scroll */}
              {pageComments.map((comment, i) => {
                const screenY = toScreenYPct(comment.y_percent)
                if (screenY === null) return null
                // Hide pins that are scrolled out of view (with a small buffer)
                if (screenY < -5 || screenY > 105) return null
                return (
                  <CommentPin
                    key={comment.id}
                    comment={comment}
                    index={i + 1}
                    screenXPct={comment.x_percent}
                    screenYPct={screenY}
                    isActive={activeCommentId === comment.id}
                    onClick={() => setActiveCommentId(activeCommentId === comment.id ? null : comment.id)}
                    onResolve={handleResolve}
                    onDelete={handleDelete}
                  />
                )
              })}

              {/* Pending pin */}
              {pendingPin && (
                <div
                  className="absolute z-30"
                  style={{ left: `${pendingPin.xPct}%`, top: `${pendingPin.screenYPct}%` }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium -translate-x-1/2 -translate-y-1/2"
                    style={{ backgroundColor: 'var(--accent)', color: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
                  >
                    +
                  </div>
                  <CommentInput
                    onSave={handleSaveComment}
                    onCancel={() => setPendingPin(null)}
                  />
                </div>
              )}
            </div>
          )}

          {mode === 'comment' && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs z-20 pointer-events-none"
              style={{ backgroundColor: 'var(--text)', color: 'var(--bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
            >
              Click anywhere to place a comment
            </div>
          )}

          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
            </div>
          )}
        </div>

        {sidebarOpen && (
          <CommentSidebar
            comments={comments}
            currentPath={currentPath}
            activeCommentId={activeCommentId}
            onSelectComment={setActiveCommentId}
            onResolve={handleResolve}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}
