import { useEffect, useState } from 'react'
import { listHistory, deleteHistory, getDigest } from '../lib/api'
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
  const [search, setSearch] = useState('')
  const [monitorBadge, setMonitorBadge] = useState(0)

  useEffect(() => {
    setLoading(true)
    listHistory()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [refreshTrigger])

  useEffect(() => {
    getDigest().then(d => setMonitorBadge(d.total_new)).catch(() => {})
  }, [])

  async function handleDelete(e: React.MouseEvent, threadId: string) {
    e.stopPropagation()
    await deleteHistory(threadId)
    setConversations(prev => prev.filter(c => c.thread_id !== threadId))
  }

  function timeAgo(dateStr: string): string {
    const d = new Date(dateStr)
    const diff = Date.now() - d.getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)  return 'now'
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const filteredConvs = search.trim()
    ? conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations

  return (
    <aside className="sidebar-root">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🔬</div>
        <div>
          <div className="sidebar-logo-name">IntelLab</div>
          <div className="sidebar-logo-sub">Intelligence Suite</div>
        </div>
      </div>

      {/* Primary action */}
      <button className="sidebar-btn primary" onClick={onNewChat}>
        ✦ New Research
      </button>

      {/* Nav */}
      <button
        className="sidebar-btn"
        onClick={onOpenMonitor}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>⬡</span> Knowledge Monitor
        </span>
        {monitorBadge > 0 && <span className="badge-pill">{monitorBadge}</span>}
      </button>
      <button className="sidebar-btn" onClick={onOpenDashboard}>
        <span>⊞</span> Dashboard
      </button>

      {/* Search */}
      <div className="sidebar-section-label">Recent Sessions</div>
      <div style={{ padding: '0 0 6px' }}>
        <label className="sidebar-search">
          <span className="sidebar-search-icon">⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions…"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
            >×</button>
          )}
        </label>
      </div>

      {/* History list */}
      <div style={{ flex: 1, overflowY: 'auto', marginRight: -4, paddingRight: 4 }}>
        {loading ? (
          <div style={{ display: 'flex', gap: 6, padding: '10px 14px', alignItems: 'center' }}>
            {[0, 0.2, 0.4].map((d, i) => (
              <span key={i} className="typing-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(99,102,241,0.45)', display: 'inline-block', animationDelay: `${d}s` }} />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-4)', padding: '8px 14px', lineHeight: 1.65 }}>
            No sessions yet.<br />Start a new one above.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {filteredConvs.map(c => {
              const isActive = c.thread_id === activeThreadId
              return (
                <li key={c.thread_id} className="group">
                  <button
                    onClick={() => onSelectConversation(c.thread_id)}
                    className={`history-item${isActive ? ' active' : ''}`}
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
                      {c.title}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-5)', flexShrink: 0, marginLeft: 6 }}>
                      {timeAgo(c.updated_at)}
                    </span>
                    <button
                      onClick={e => handleDelete(e, c.thread_id)}
                      style={{
                        opacity: 0, color: 'var(--text-4)', fontSize: 14,
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0 2px', lineHeight: 1, flexShrink: 0, transition: 'all 0.15s',
                        marginLeft: 4,
                      }}
                      className="group-hover:opacity-100"
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.opacity = '1'
                        ;(e.currentTarget as HTMLElement).style.color = 'rgba(248,113,113,0.7)'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.opacity = '0'
                        ;(e.currentTarget as HTMLElement).style.color = 'var(--text-4)'
                      }}
                    >×</button>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="avatar">{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="user-name-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.name}
          </div>
          <div className="user-role-text">Online</div>
        </div>
        <button
          onClick={onLogout}
          title="Sign out"
          style={{ color: 'var(--text-5)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s', padding: 4 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(248,113,113,0.7)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-5)' }}
        >⊗</button>
      </div>
    </aside>
  )
}
