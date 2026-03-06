'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  onSave: (text: string, author: string) => void
  onCancel: () => void
}

export default function CommentInput({ onSave, onCancel }: Props) {
  const [text, setText] = useState('')
  const [author, setAuthor] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('annotate_author') || '' : ''
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleSave() {
    if (!text.trim()) return
    if (author.trim()) localStorage.setItem('annotate_author', author.trim())
    onSave(text.trim(), author.trim() || 'Anonymous')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div
      className="absolute left-8 top-0 w-72 rounded-lg z-30"
      style={{
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="p-3">
        <input
          type="text"
          placeholder="Your name (optional)"
          value={author}
          onChange={e => setAuthor(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded-md mb-2 outline-none"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
        />
        <textarea
          ref={textareaRef}
          placeholder="Leave a comment…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          className="w-full text-sm px-2 py-2 rounded-md resize-none outline-none"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
        />
        <p className="text-xs mt-1 mb-2" style={{ color: 'var(--text-muted)' }}>
          ⌘↵ to save · Esc to cancel
        </p>
      </div>
      <div
        className="flex items-center justify-end gap-2 px-3 py-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <button
          onClick={onCancel}
          className="text-xs px-2.5 py-1 rounded-md cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!text.trim()}
          className="text-xs px-2.5 py-1 rounded-md font-medium transition-opacity disabled:opacity-40 cursor-pointer"
          style={{ backgroundColor: 'var(--text)', color: 'var(--bg)' }}
        >
          Save
        </button>
      </div>
    </div>
  )
}
