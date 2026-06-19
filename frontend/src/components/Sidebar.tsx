import { useEffect, useState } from 'react'
import { listHistory, deleteHistory } from '../lib/api'
import type { Conversation, User } from '../types'

interface Props {
  user: User
  onLogout: () => void
  onSelectConversation: (threadId: string) => void
  onNewChat: () => void
  activeThreadId?: string
  refreshTrigger: number
  onOpenMonitor: () => void
  onOpenDashboard: () => void
}

export default function Sidebar({
  user,
  onLogout,
  onSelectConversation,
  onNewChat,
  activeThreadId,
  refreshTrigger,
  onOpenMonitor,
  onOpenDashboard,
}: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listHistory()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [refreshTrigger])

  async function handleDelete(e: React.MouseEvent, threadId: string) {
    e.stopPropagation()
    await deleteHistory(threadId)
    setConversations(prev => prev.filter(c => c.thread_id !== threadId))
  }

  function timeAgo(dateStr: string): string {
    const d = new Date(dateStr)
    const now = Date.now()
    const diff = now - d.getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)   return 'just now'
    if (m < 60)  return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24)  return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <aside className="w-64 shrink-0 flex flex-col h-full bg-panel border-r border-border">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <span className="font-semibold text-white text-sm">Research Assistant</span>
      </div>

      {/* New chat */}
      <div className="p-3">
        <button onClick={onNewChat} className="w-full btn-primary text-sm py-2 flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Research
        </button>
      </div>

      {/* Monitor + Dashboard buttons */}
      <div className="px-3 pb-1 flex flex-col gap-0.5">
        <button
          onClick={onOpenMonitor}
          className="w-full btn-ghost text-sm py-2 flex items-center gap-2 text-left"
        >
          <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Knowledge Monitor
        </button>
        <button
          onClick={onOpenDashboard}
          className="w-full btn-ghost text-sm py-2 flex items-center gap-2 text-left"
        >
          <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          Dashboard
        </button>
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <p className="text-xs text-muted font-medium uppercase tracking-wider px-2 py-2">History</p>
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted typing-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted typing-dot" />
            </div>
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-muted text-center py-6 px-2">No conversations yet.<br />Start your first research!</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map(c => (
              <li key={c.thread_id}>
                <button
                  onClick={() => onSelectConversation(c.thread_id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg group flex items-start gap-2 transition-colors ${
                    c.thread_id === activeThreadId
                      ? 'bg-accent/15 border border-accent/30'
                      : 'hover:bg-card'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate leading-tight">{c.title}</p>
                    <p className="text-xs text-muted mt-0.5">{timeAgo(c.updated_at)}</p>
                  </div>
                  <button
                    onClick={e => handleDelete(e, c.thread_id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted hover:text-red-400 transition-all shrink-0 mt-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* User info + logout */}
      <div className="p-3 border-t border-border flex items-center gap-2">
        <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{user.name}</p>
          <p className="text-xs text-muted truncate">{user.email}</p>
        </div>
        <button onClick={onLogout} className="p-1.5 text-muted hover:text-white rounded-lg hover:bg-card transition-colors" title="Sign out">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
