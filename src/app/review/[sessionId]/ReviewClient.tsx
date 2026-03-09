'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Session, Comment } from '@/lib/types'
import CommentPin from '@/components/CommentPin'
import CommentSidebar from '@/components/CommentSidebar'
import CommentInput from '@/components/CommentInput'

interface PendingPin {
  xPct: number       // % of overlay width
  yAbsPx: number     // absolute px from page top — the Miro coordinate
  screenYPx: number  // px from viewport top (for positioning the input bubble)
}

interface IframeMsg {
  scrollY: number
  pageHeight: number
  realUrl: string
  event?: string
}

// When jumping to a comment on a different page, we queue the jump here
// and execute it once the new page's injected script reports back
interface PendingJump {
  comment: Comment
  pageUrl: string
}

type Mode = 'browse' | 'comment'

const CANVAS_HEIGHT = 99999 // tall enough for any page; clipped by parent overflow:hidden

export default function ReviewClient({ session }: { session: Session }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(session.url)
  const [scrollY, setScrollY] = useState(0)
  const [pageHeight, setPageHeight] = useState(0)
  const [copied, setCopied] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mode, setMode] = useState<Mode>('browse')

  const overlayRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pendingJumpRef = useRef<PendingJump | null>(null)
  // Track the last URL we sent a scrollTo for (to avoid duplicate scrolls)
  const lastJumpedUrlRef = useRef<string | null>(null)

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/comments?session_id=${session.id}`)
    const data = await res.json()
    if (Array.isArray(data)) setComments(data)
  }, [session.id])

  useEffect(() => { fetchComments() }, [fetchComments])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data as IframeMsg & { __annotate?: boolean }
      if (!d?.__annotate) return

      setScrollY(d.scrollY ?? 0)
      setPageHeight(d.pageHeight ?? 0)

      if (d.realUrl) setCurrentUrl(d.realUrl)

      // If there's a pending jump and this message is the load event for the target page
      if (pendingJumpRef.current && d.event === 'load') {
        const jump = pendingJumpRef.current
        if (lastJumpedUrlRef.current !== jump.pageUrl) {
          lastJumpedUrlRef.current = jump.pageUrl
          const scrollTarget = Math.max(0, jump.comment.y_abs_px - 150)
          // Small delay to let the page settle its height
          setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage(
              { __annotateCommand: 'scrollTo', y: scrollTarget },
              '*'
            )
            setActiveCommentId(jump.comment.id)
          }, 300)
          pendingJumpRef.current = null
        }
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
    const screenYPx = e.clientY - rect.top

    // The Miro coordinate: absolute px from page top, regardless of scroll
    const yAbsPx = screenYPx + scrollY

    setPendingPin({ xPct, yAbsPx, screenYPx })
    setActiveCommentId(null)
  }

  async function handleSaveComment(text: string, author: string) {
    if (!pendingPin) return

    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        page_path: new URL(currentUrl).pathname,
        page_url: currentUrl,
        x_percent: pendingPin.xPct,
        y_abs_px: pendingPin.yAbsPx,          // absolute px — source of truth
        y_percent: pageHeight > 0              // legacy, for export readability
          ? (pendingPin.yAbsPx / pageHeight) * 100
          : 0,
        page_height_px: pageHeight,
        viewport_width_px: overlayRef.current?.clientWidth ?? 0,
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

  function handleJumpToComment(comment: Comment) {
    const targetUrl = comment.page_url || new URL(comment.page_path, session.url).href
    const targetPath = new URL(targetUrl).pathname
    const currentPath = new URL(currentUrl).pathname

    if (targetPath !== currentPath) {
      // Different page — queue the jump, navigate iframe
      pendingJumpRef.current = { comment, pageUrl: targetUrl }
      lastJumpedUrlRef.current = null
      if (iframeRef.current) {
        iframeRef.current.src = `/api/proxy?url=${encodeURIComponent(targetUrl)}`
        setIframeLoaded(false)
        setScrollY(0)
        setPageHeight(0)
      }
    } else {
      // Same page — scroll directly to pin position
      const scrollTarget = Math.max(0, comment.y_abs_px - 150)
      iframeRef.current?.contentWindow?.postMessage(
        { __annotateCommand: 'scrollTo', y: scrollTarget },
        '*'
      )
      setActiveCommentId(comment.id)
    }
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentPath = new URL(currentUrl).pathname
  const pageComments = comments.filter(c => {
    const cPath = c.page_url ? new URL(c.page_url).pathname : c.page_path
    return cPath === currentPath
  })
  const unresolvedCount = comments.filter(c => !c.resolved).length
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(session.url)}`

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
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
            {new URL(session.url).hostname}{currentPath !== '/' ? currentPath : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}>
              {unresolvedCount} open
            </span>
          )}
          <a
            href={`/api/sessions/${session.id}/export`}
            download
            className="text-xs px-2.5 py-1 rounded-md cursor-pointer"
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
            className="text-xs px-2.5 py-1 rounded-md cursor-pointer"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            {sidebarOpen ? 'Hide' : 'Comments'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          <iframe
            ref={iframeRef}
            src={proxyUrl}
            className="w-full h-full border-0"
            onLoad={() => setIframeLoaded(true)}
            title="Review target"
            style={{ pointerEvents: mode === 'browse' ? 'auto' : 'none' }}
          />

          {iframeLoaded && (
            <div
              ref={overlayRef}
              className="absolute inset-0 overflow-hidden"
              style={{
                cursor: mode === 'comment' ? 'crosshair' : 'default',
                pointerEvents: mode === 'comment' ? 'auto' : 'none',
              }}
              onClick={handleOverlayClick}
            >
              {/*
                Miro-board canvas: a tall fixed div that translates by -scrollY.
                Pins sit at their absolute y_abs_px coordinate, always.
                No page height math — just pure coordinate positioning.
              */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${CANVAS_HEIGHT}px`,
                  transform: `translateY(${-scrollY}px)`,
                  pointerEvents: 'none',
                  willChange: 'transform',
                }}
              >
                {pageComments.map((comment, i) => (
                  <CommentPin
                    key={comment.id}
                    comment={comment}
                    index={i + 1}
                    xPct={comment.x_percent}
                    yPx={comment.y_abs_px}
                    isActive={activeCommentId === comment.id}
                    onClick={() => setActiveCommentId(activeCommentId === comment.id ? null : comment.id)}
                    onResolve={handleResolve}
                    onDelete={handleDelete}
                  />
                ))}
              </div>

              {/* Pending pin — at viewport position, outside the scroll canvas */}
              {pendingPin && (
                <div
                  className="absolute z-30"
                  style={{ left: `${pendingPin.xPct}%`, top: `${pendingPin.screenYPx}px` }}
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
            onSelectComment={(id) => {
              if (!id) { setActiveCommentId(null); return }
              const c = comments.find(c => c.id === id)
              if (c) handleJumpToComment(c)
            }}
            onResolve={handleResolve}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}
