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
    const diff = Date.now() - d.getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)  return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside
      className="w-64 shrink-0 flex flex-col h-full relative"
      style={{ background: '#101008' }}
    >
      {/* Gold gradient right-edge divider */}
      <div
        aria-hidden
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '1px',
          background: 'linear-gradient(180deg, transparent 0%, #d4a847 20%, #d4a847 80%, transparent 100%)',
          opacity: 0.3,
          zIndex: 1,
        }}
      />

      {/* Logo */}
      <div className="px-7 pt-8 pb-6">
        <div style={{ color: '#d4a847', fontSize: '18px', letterSpacing: '0.1em', marginBottom: '6px' }}>
          ◆ RESEARCH AI
        </div>
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, #d4a847, transparent)',
          opacity: 0.45,
        }} />
      </div>

      {/* New research */}
      <div className="px-7 mb-2">
        <button onClick={onNewChat} className="w-full btn-primary">
          ◆ &nbsp; New Research
        </button>
      </div>

      {/* Nav */}
      <div className="px-7 flex flex-col mt-1">
        <button
          onClick={onOpenMonitor}
          className="btn-ghost w-full text-left flex items-center gap-2.5 py-2"
        >
          <span style={{ color: 'rgba(212,168,71,0.5)' }}>◈</span> Knowledge Monitor
        </button>
        <button
          onClick={onOpenDashboard}
          className="btn-ghost w-full text-left flex items-center gap-2.5 py-2"
        >
          <span style={{ color: 'rgba(212,168,71,0.5)' }}>⊞</span> Dashboard
        </button>
      </div>

      {/* Section rule */}
      <div className="section-rule px-7">
        <span className="section-rule-label">Archive</span>
        <span className="section-rule-line" />
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto px-7">
        {loading ? (
          <div className="flex gap-1.5 py-4">
            <span className="w-1.5 h-1.5 bg-accent typing-dot" />
            <span className="w-1.5 h-1.5 bg-accent typing-dot" />
            <span className="w-1.5 h-1.5 bg-accent typing-dot" />
          </div>
        ) : conversations.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.2)', fontFamily: "'Segoe UI', system-ui, sans-serif", lineHeight: 1.6 }}>
            No sessions yet.<br />Start new research above.
          </p>
        ) : (
          <ul className="flex flex-col">
            {conversations.map(c => (
              <li key={c.thread_id}>
                <button
                  onClick={() => onSelectConversation(c.thread_id)}
                  className="w-full text-left group flex items-start gap-1.5 py-2 transition-all"
                  style={{
                    borderBottom: '1px solid rgba(212,168,71,0.05)',
                    color: c.thread_id === activeThreadId
                      ? 'rgba(212,168,71,0.8)'
                      : 'rgba(245,240,232,0.28)',
                    fontSize: '12px',
                    fontFamily: "'Segoe UI', system-ui, sans-serif",
                    letterSpacing: '0.02em',
                  }}
                  onMouseEnter={e => { if (c.thread_id !== activeThreadId) (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.6)' }}
                  onMouseLeave={e => { if (c.thread_id !== activeThreadId) (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.28)' }}
                >
                  <span style={{ color: c.thread_id === activeThreadId ? 'rgba(212,168,71,0.6)' : 'transparent', flexShrink: 0, marginTop: '2px', fontSize: '8px' }}>◆</span>
                  <span className="flex-1 truncate leading-snug">{c.title}</span>
                  <button
                    onClick={e => handleDelete(e, c.thread_id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1"
                    style={{ color: 'rgba(245,240,232,0.3)', fontSize: '14px', lineHeight: 1 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.7)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.3)' }}
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
        className="px-7 py-5 flex items-center gap-3"
        style={{ borderTop: '1px solid rgba(212,168,71,0.15)' }}
      >
        <div
          style={{
            width: 32, height: 32, flexShrink: 0,
            border: '1px solid rgba(212,168,71,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: '13px', fontWeight: 600, color: '#d4a847',
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.7)', fontFamily: "'Segoe UI', system-ui, sans-serif", letterSpacing: '0.04em' }} className="truncate">
            {user.name}
          </p>
          <p style={{ fontSize: '10px', color: 'rgba(212,168,71,0.4)', letterSpacing: '0.08em', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
            Active
          </p>
        </div>
        <button
          onClick={onLogout}
          title="Sign out"
          style={{ color: 'rgba(245,240,232,0.25)', fontSize: '18px', lineHeight: 1, transition: 'color 0.2s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.6)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.25)' }}
        >
          ×
        </button>
      </div>
    </aside>
  )
}
