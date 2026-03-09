'use client'

import { useState } from 'react'
import type { Comment } from '@/lib/types'

interface Props {
  comment: Comment
  index: number
  isActive: boolean
  onClick: () => void
  onResolve: (id: string, resolved: boolean) => void
  onDelete: (id: string) => void
}

export default function CommentPin({ comment, index, isActive, onClick, onResolve, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      className="absolute z-20"
      style={{ left: `${comment.x_percent}%`, top: `${comment.y_percent}%`, pointerEvents: 'auto' }}
    >
      {/* Pin */}
      <button
        onClick={e => { e.stopPropagation(); onClick() }}
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110 cursor-pointer"
        style={{
          backgroundColor: comment.resolved ? 'var(--text-muted)' : 'var(--accent)',
          color: 'white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          opacity: comment.resolved ? 0.6 : 1,
        }}
        title={comment.text}
      >
        {index}
      </button>

      {/* Popover */}
      {isActive && (
        <div
          className="absolute left-8 top-0 w-64 rounded-lg p-3 z-30"
          style={{
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{comment.author}</span>
            <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
              {new Date(comment.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text)' }}>{comment.text}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onResolve(comment.id, !comment.resolved)}
              className="text-xs px-2 py-1 rounded-md transition-colors cursor-pointer"
              style={{
                border: '1px solid var(--border)',
                color: comment.resolved ? 'var(--accent)' : 'var(--text-muted)',
                backgroundColor: comment.resolved ? 'var(--accent-light)' : 'transparent',
              }}
            >
              {comment.resolved ? 'Reopen' : 'Resolve'}
            </button>
            {confirmDelete ? (
              <>
                <button
                  onClick={() => onDelete(comment.id)}
                  className="text-xs px-2 py-1 rounded-md cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)', color: 'white', border: '1px solid var(--accent)' }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
