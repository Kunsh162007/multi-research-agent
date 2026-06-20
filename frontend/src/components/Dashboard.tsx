import { useEffect, useState } from 'react'
import { getStats } from '../lib/api'
import type { Stats } from '../types'

interface Props { onClose: () => void }

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 12,
  padding: '18px 20px',
  position: 'relative',
  overflow: 'hidden',
}

function GlassSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={glass}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.35), transparent)',
      }} />
      <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(249,115,22,0.65)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
        {title}
      </p>
      {children}
    </div>
  )
}

export default function Dashboard({ onClose }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => { getStats().then(setStats).catch(console.error) }, [])
  const maxActivity = stats ? Math.max(...stats.activity.map(a => a.count), 1) : 1

  const STAT_CARDS = stats ? [
    { label: 'Sessions',    value: stats.total_conversations,    icon: '⬡', color: '#fb923c' },
    { label: 'Reports',     value: stats.total_reports,          icon: '✦', color: '#a78bfa' },
    { label: 'Topics',      value: stats.monitor.topics,         icon: '⟳', color: '#f59e0b' },
    { label: 'Intel Items', value: stats.monitor.knowledge_items, icon: '◇', color: '#fed7aa' },
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(10,11,26,0.5)', backdropFilter: 'blur(16px)' }}>

      {/* Header */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, boxShadow: '0 0 14px rgba(249,115,22,0.4)',
            }}>⊞</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e4f0' }}>Analytics</p>
              <p style={{ fontSize: 9, color: '#f97316', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Research Overview</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            fontSize: 10, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'color 0.2s', background: 'none', border: 'none', padding: '4px 8px',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569' }}
          >Close ×</button>
        </div>
      </div>

      {!stats ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 0.2, 0.4].map((d, i) => (
              <span key={i} className="typing-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(249,115,22,0.5)', display: 'inline-block', animationDelay: `${d}s` }} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {STAT_CARDS.map(s => (
              <div key={s.label} style={{ ...glass, padding: '16px 18px' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                  background: `linear-gradient(90deg, transparent, ${s.color}45, transparent)`,
                }} />
                <div style={{ fontSize: 16, color: s.color, marginBottom: 8 }}>{s.icon}</div>
                <div style={{
                  fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 6,
                  color: s.color, fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.value.toLocaleString()}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#334155', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Activity */}
          {stats.activity.length > 0 && (
            <GlassSection title="Activity — 14 Days">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 56 }}>
                {stats.activity.map(a => (
                  <div key={a.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
                    className="group">
                    <div style={{
                      width: '100%',
                      height: `${Math.max(3, (a.count / maxActivity) * 48)}px`,
                      background: a.count > 0
                        ? 'linear-gradient(180deg, #f97316, #ea580c)'
                        : 'rgba(255,255,255,0.05)',
                      borderRadius: '3px 3px 0 0',
                      boxShadow: a.count > 0 ? '0 0 8px rgba(249,115,22,0.4)' : 'none',
                      opacity: a.count > 0 ? 0.85 : 1,
                      transition: 'opacity 0.2s',
                    }} />
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                      style={{
                        fontSize: 10, color: '#fed7aa',
                        background: 'rgba(10,11,26,0.92)', backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(249,115,22,0.25)', padding: '2px 6px', borderRadius: 4,
                      }}>
                      {a.count}
                    </span>
                  </div>
                ))}
              </div>
            </GlassSection>
          )}

          {/* Top tags */}
          {stats.top_tags.length > 0 && (
            <GlassSection title="Top Tags">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stats.top_tags.map(t => {
                  const pct = (t.count / (stats.top_tags[0]?.count || 1)) * 100
                  return (
                    <div key={t.tag} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: '#64748b', width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tag}</span>
                      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #f97316, #ea580c)', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#fb923c', minWidth: 20, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>
                    </div>
                  )
                })}
              </div>
            </GlassSection>
          )}

          {/* Recent */}
          {stats.recent.length > 0 && (
            <GlassSection title="Recent Sessions">
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.recent.map((r, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(249,115,22,0.4)', flexShrink: 0, minWidth: 16 }}>{i + 1}.</span>
                    <span style={{ fontSize: 12.5, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    <span style={{ fontSize: 10, color: '#334155', flexShrink: 0 }}>
                      {new Date(r.updated_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassSection>
          )}
        </div>
      )}
    </div>
  )
}
