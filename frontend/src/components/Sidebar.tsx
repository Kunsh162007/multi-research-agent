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
    <aside
      className="w-64 shrink-0 flex flex-col h-full relative"
      style={{
        background: 'linear-gradient(180deg, rgba(8,16,48,0.92) 0%, rgba(4,10,30,0.95) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset -1px 0 0 rgba(79,195,247,0.06)',
      }}
    >
      {/* Vertical accent line */}
      <div
        aria-hidden
        style={{
          position: 'absolute', right: 0, top: '10%', bottom: '10%', width: '1px',
          background: 'linear-gradient(180deg, transparent 0%, rgba(79,195,247,0.25) 30%, rgba(129,140,248,0.25) 70%, transparent 100%)',
          zIndex: 1,
        }}
      />

      {/* Logo */}
      <div style={{ padding: '24px 20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '8px',
            background: 'linear-gradient(135deg, #4fc3f7, #06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: '800', color: 'rgba(0,0,0,0.8)',
            flexShrink: 0,
            boxShadow: '0 0 16px rgba(79,195,247,0.3)',
          }}>I</div>
          <div>
            <div style={{
              fontSize: '13px', fontWeight: '700', letterSpacing: '0.06em',
              background: 'linear-gradient(135deg, #7dd3fc 0%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              IntelLab
            </div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Research AI
            </div>
          </div>
        </div>
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, rgba(79,195,247,0.3), rgba(129,140,248,0.2), transparent)',
        }} />
      </div>

      {/* New session button */}
      <div style={{ padding: '0 16px 12px' }}>
        <button
          onClick={onNewChat}
          style={{
            width: '100%',
            padding: '9px 14px',
            background: 'linear-gradient(135deg, rgba(79,195,247,0.15) 0%, rgba(6,182,212,0.08) 100%)',
            border: '1px solid rgba(79,195,247,0.3)',
            borderRadius: '10px',
            color: '#7dd3fc',
            fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            backdropFilter: 'blur(8px)',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = 'linear-gradient(135deg, rgba(79,195,247,0.25) 0%, rgba(6,182,212,0.15) 100%)'
            el.style.boxShadow = '0 0 20px rgba(79,195,247,0.2)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = 'linear-gradient(135deg, rgba(79,195,247,0.15) 0%, rgba(6,182,212,0.08) 100%)'
            el.style.boxShadow = 'none'
          }}
        >
          <span style={{ fontSize: '14px' }}>+</span> New Session
        </button>
      </div>

      {/* Nav */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {[
          { label: 'Trend Radar', icon: '◈', onClick: onOpenMonitor, color: '#818cf8', badge: monitorBadge },
          { label: 'Analytics', icon: '⊞', onClick: onOpenDashboard, color: '#34d399', badge: 0 },
        ].map(({ label, icon, onClick, color, badge }) => (
          <button
            key={label}
            onClick={onClick}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 12px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderRadius: '8px', transition: 'all 0.18s',
              display: 'flex', alignItems: 'center', gap: '8px',
              fontSize: '12px', color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.background = 'rgba(255,255,255,0.05)'
              el.style.color = 'rgba(255,255,255,0.75)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.background = 'transparent'
              el.style.color = 'rgba(255,255,255,0.45)'
            }}
          >
            <span style={{ color, fontSize: '12px', width: '16px', flexShrink: 0 }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {badge > 0 && (
              <span style={{
                fontSize: '9px', fontWeight: '700', padding: '1px 6px',
                background: 'rgba(129,140,248,0.2)', border: '1px solid rgba(129,140,248,0.4)',
                borderRadius: '10px', color: '#a5b4fc',
              }}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Section divider */}
      <div className="section-rule" style={{ padding: '0 20px', margin: '14px 0 8px' }}>
        <span className="section-rule-label">Sessions</span>
        <span className="section-rule-line" />
      </div>

      {/* Search bar */}
      <div style={{ padding: '0 12px 8px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sessions…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
            color: 'rgba(255,255,255,0.7)', fontSize: '11px', padding: '6px 10px',
            outline: 'none', fontFamily: 'system-ui, sans-serif',
          }}
          onFocus={e => { (e.target as HTMLElement).style.borderColor = 'rgba(79,195,247,0.3)' }}
          onBlur={e => { (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
        />
      </div>

      {/* History */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        {loading ? (
          <div style={{ display: 'flex', gap: '6px', padding: '12px 8px', alignItems: 'center' }}>
            <span className="typing-dot" style={{ width: 4, height: 4, background: 'rgba(79,195,247,0.4)', borderRadius: '50%', display: 'inline-block' }} />
            <span className="typing-dot" style={{ width: 4, height: 4, background: 'rgba(79,195,247,0.4)', borderRadius: '50%', display: 'inline-block', animationDelay: '0.2s' }} />
            <span className="typing-dot" style={{ width: 4, height: 4, background: 'rgba(79,195,247,0.4)', borderRadius: '50%', display: 'inline-block', animationDelay: '0.4s' }} />
          </div>
        ) : conversations.length === 0 ? (
          <p style={{
            fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontFamily: 'system-ui, sans-serif',
            lineHeight: 1.6, padding: '8px',
          }}>
            No sessions yet.<br />
            Start a new one above.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredConvs.map(c => {
              const isActive = c.thread_id === activeThreadId
              return (
                <li key={c.thread_id}>
                  <button
                    onClick={() => onSelectConversation(c.thread_id)}
                    className="group"
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(79,195,247,0.12) 0%, rgba(6,182,212,0.06) 100%)'
                        : 'transparent',
                      border: isActive ? '1px solid rgba(79,195,247,0.2)' : '1px solid transparent',
                      color: isActive ? '#7dd3fc' : 'rgba(255,255,255,0.4)',
                      fontSize: '12px', letterSpacing: '0.01em',
                      cursor: 'pointer', transition: 'all 0.18s',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        const el = e.currentTarget as HTMLElement
                        el.style.background = 'rgba(255,255,255,0.04)'
                        el.style.color = 'rgba(255,255,255,0.65)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        const el = e.currentTarget as HTMLElement
                        el.style.background = 'transparent'
                        el.style.color = 'rgba(255,255,255,0.4)'
                      }
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: isActive ? '#4fc3f7' : 'rgba(255,255,255,0.15)',
                      boxShadow: isActive ? '0 0 6px rgba(79,195,247,0.5)' : 'none',
                    }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                      {c.title}
                    </span>
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                      {timeAgo(c.updated_at)}
                    </span>
                    <button
                      onClick={e => handleDelete(e, c.thread_id)}
                      style={{
                        opacity: 0, color: 'rgba(255,255,255,0.3)', fontSize: '14px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0 2px', lineHeight: 1, flexShrink: 0, transition: 'all 0.15s',
                      }}
                      className="group-hover:opacity-100"
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.color = 'rgba(252,165,165,0.7)'
                        ;(e.currentTarget as HTMLElement).style.opacity = '1'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'
                        ;(e.currentTarget as HTMLElement).style.opacity = '0'
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
      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}
      >
        <div
          style={{
            width: 32, height: 32, flexShrink: 0, borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(79,195,247,0.3), rgba(129,140,248,0.3))',
            border: '1px solid rgba(79,195,247,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: '700', color: '#7dd3fc',
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.75)', letterSpacing: '0.02em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.name}
          </p>
          <p style={{ fontSize: '9px', color: 'rgba(79,195,247,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Online
          </p>
        </div>
        <button
          onClick={onLogout}
          title="Sign out"
          style={{
            color: 'rgba(255,255,255,0.2)', fontSize: '16px', lineHeight: 1,
            transition: 'color 0.2s', background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(252,165,165,0.7)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)' }}
        >
          ×
        </button>
      </div>
    </aside>
  )
}
