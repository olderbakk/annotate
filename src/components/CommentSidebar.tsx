'use client'

import type { Comment } from '@/lib/types'

interface Props {
  comments: Comment[]
  currentPath: string
  activeCommentId: string | null
  onSelectComment: (id: string | null) => void
  onResolve: (id: string, resolved: boolean) => void
  onDelete: (id: string) => void
}

export default function CommentSidebar({
  comments,
  currentPath,
  activeCommentId,
  onSelectComment,
  onResolve,
  onDelete,
}: Props) {
  const open = comments.filter(c => !c.resolved)
  const resolved = comments.filter(c => c.resolved)

  return (
    <aside
      className="w-72 shrink-0 flex flex-col overflow-hidden"
      style={{ borderLeft: '1px solid var(--border)', backgroundColor: 'var(--bg)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
          Comments
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {open.length} open
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No comments yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
              Click anywhere on the page to add one
            </p>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <section className="py-2">
                {open.map((c, i) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    index={comments.indexOf(c) + 1}
                    isActive={activeCommentId === c.id}
                    isCurrentPage={c.page_path.replace(/\/$/, '') === currentPath}
                    onClick={() => onSelectComment(activeCommentId === c.id ? null : c.id)}
                    onResolve={onResolve}
                    onDelete={onDelete}
                  />
                ))}
              </section>
            )}

            {resolved.length > 0 && (
              <section>
                <div
                  className="px-4 py-2 text-xs font-medium tracking-wide uppercase"
                  style={{ color: 'var(--text-muted)', opacity: 0.6 }}
                >
                  Resolved
                </div>
                {resolved.map(c => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    index={comments.indexOf(c) + 1}
                    isActive={activeCommentId === c.id}
                    isCurrentPage={c.page_path.replace(/\/$/, '') === currentPath}
                    onClick={() => onSelectComment(activeCommentId === c.id ? null : c.id)}
                    onResolve={onResolve}
                    onDelete={onDelete}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

function CommentRow({
  comment,
  index,
  isActive,
  isCurrentPage,
  onClick,
  onResolve,
  onDelete,
}: {
  comment: Comment
  index: number
  isActive: boolean
  isCurrentPage: boolean
  onClick: () => void
  onResolve: (id: string, resolved: boolean) => void
  onDelete: (id: string) => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 transition-colors cursor-pointer"
      style={{
        backgroundColor: isActive ? 'var(--bg-secondary)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        opacity: comment.resolved ? 0.5 : 1,
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5"
          style={{
            backgroundColor: comment.resolved ? 'var(--bg-secondary)' : 'var(--accent-light)',
            color: comment.resolved ? 'var(--text-muted)' : 'var(--accent)',
          }}
        >
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
              {comment.author}
            </span>
            <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
              {new Date(comment.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
            {comment.text}
          </p>
          {!isCurrentPage && (
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--accent)', opacity: 0.7 }}>
              {comment.page_path}
            </p>
          )}
          {isActive && (
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={e => { e.stopPropagation(); onResolve(comment.id, !comment.resolved) }}
                className="text-xs cursor-pointer"
                style={{ color: comment.resolved ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(comment.id) }}
                className="text-xs cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
