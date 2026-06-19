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

  const initials = user.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside
      className="w-64 shrink-0 flex flex-col h-full bg-surface"
      style={{ borderRight: '1px solid rgba(0,255,225,0.25)', boxShadow: '2px 0 20px rgba(0,255,225,0.05)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(0,255,225,0.15)' }}>
        <div
          className="text-lg font-bold tracking-widest text-accent"
          style={{ textShadow: '0 0 10px #00ffe1, 0 0 20px #00ffe1' }}
        >
          RSRCH.AI
        </div>
        <div className="text-xs text-magenta tracking-widest mt-0.5">// INTELLIGENCE TERMINAL v2.4</div>
      </div>

      {/* New session */}
      <div className="px-4 py-3">
        <button onClick={onNewChat} className="w-full btn-primary py-2 flex items-center justify-center gap-2">
          [ + ] NEW_SESSION
        </button>
      </div>

      {/* Nav */}
      <div className="px-4 flex flex-col gap-0.5">
        <button
          onClick={onOpenMonitor}
          className="w-full text-left flex items-center gap-2 px-2 py-2 text-xs font-mono tracking-wide text-muted hover:text-accent transition-colors"
        >
          <span className="text-accent">[ ⬡ ]</span> KNOWLEDGE_MONITOR
        </button>
        <button
          onClick={onOpenDashboard}
          className="w-full text-left flex items-center gap-2 px-2 py-2 text-xs font-mono tracking-wide text-muted hover:text-accent transition-colors"
        >
          <span className="text-accent">[ ⊞ ]</span> DASHBOARD
        </button>
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto mt-2">
        <p
          className="text-xs font-mono text-dim-cyan tracking-widest px-5 py-2"
          style={{ letterSpacing: '0.15em' }}
        >
          // HISTORY
        </p>
        {loading ? (
          <div className="flex gap-1 px-5 py-3">
            <span className="w-1.5 h-1.5 bg-accent typing-dot" />
            <span className="w-1.5 h-1.5 bg-accent typing-dot" />
            <span className="w-1.5 h-1.5 bg-accent typing-dot" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-dim-cyan px-5 py-4 font-mono">
            &gt; no sessions found<br />&gt; start new research
          </p>
        ) : (
          <ul className="flex flex-col">
            {conversations.map(c => (
              <li key={c.thread_id}>
                <button
                  onClick={() => onSelectConversation(c.thread_id)}
                  className={`w-full text-left px-5 py-2 group flex items-start gap-1 transition-all text-xs font-mono ${
                    c.thread_id === activeThreadId
                      ? 'text-accent'
                      : 'text-dim-cyan hover:text-accent'
                  }`}
                  style={c.thread_id === activeThreadId ? { textShadow: '0 0 6px rgba(0,255,225,0.4)' } : {}}
                >
                  <span className="text-magenta shrink-0 mt-0.5">
                    {c.thread_id === activeThreadId ? '▶' : '>'}
                  </span>
                  <span className="flex-1 truncate leading-tight">{c.title}</span>
                  <button
                    onClick={e => handleDelete(e, c.thread_id)}
                    className="opacity-0 group-hover:opacity-100 text-dim-cyan hover:text-magenta transition-all shrink-0 ml-1"
                  >
                    ×
                  </button>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* User footer */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ borderTop: '1px solid rgba(0,255,225,0.15)' }}
      >
        <div
          className="w-8 h-8 flex items-center justify-center text-xs font-bold text-accent shrink-0"
          style={{ border: '1px solid #00ffe1', boxShadow: '0 0 8px rgba(0,255,225,0.35)' }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-accent truncate tracking-wider">
            {user.name.toUpperCase().replace(/\s+/g, '_')}
          </p>
          <p className="text-xs font-mono text-dim-cyan truncate">// ACTIVE</p>
        </div>
        <button
          onClick={onLogout}
          className="text-dim-cyan hover:text-magenta transition-colors font-mono text-xs"
          title="Sign out"
        >
          [×]
        </button>
      </div>
    </aside>
  )
}
