import { useEffect, useState } from 'react'
import { getStats } from '../lib/api'
import type { Stats } from '../types'

interface Props { onClose: () => void }

const glass = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.05) 100%)',
  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.18)', borderRadius: '12px',
  padding: '18px 20px', position: 'relative', overflow: 'hidden',
  boxShadow: '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
} as React.CSSProperties

function GlassSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={glass}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(79,195,247,0.25), transparent)',
      }} />
      <p style={{ fontSize: '9px', fontWeight: '700', color: 'rgba(56,189,248,0.7)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
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

  const statCards = stats ? [
    { label: 'Sessions',   value: stats.total_conversations,      icon: '◈', color: '#4fc3f7' },
    { label: 'Reports',    value: stats.total_reports,             icon: '◆', color: '#06b6d4' },
    { label: 'Topics',     value: stats.monitor.topics,            icon: '⟳', color: '#818cf8' },
    { label: 'Intel Items',value: stats.monitor.knowledge_items,   icon: '◇', color: '#34d399' },
  ] : []

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(4,10,30,0.5)', backdropFilter: 'blur(16px)',
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(8,16,48,0.7)', backdropFilter: 'blur(24px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '6px',
              background: 'linear-gradient(135deg, #4fc3f7, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', boxShadow: '0 0 12px rgba(79,195,247,0.3)',
            }}>⊞</div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.9)' }}>Analytics</p>
              <p style={{ fontSize: '9px', color: 'rgba(79,195,247,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Research Overview</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'color 0.2s', background: 'none', border: 'none', padding: '4px 8px',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)' }}
          >Close ×</button>
        </div>
      </div>

      {!stats ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[0,0.2,0.4].map((d,i) => (
              <span key={i} className="typing-dot" style={{ width:8,height:8,borderRadius:'50%',background:'rgba(79,195,247,0.5)',display:'inline-block',animationDelay:`${d}s` }} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {statCards.map(s => (
              <div key={s.label} style={{ ...glass, padding: '18px 20px' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                  background: `linear-gradient(90deg, transparent, ${s.color}40, transparent)`,
                }} />
                <div style={{ fontSize: '18px', color: s.color, marginBottom: '10px' }}>{s.icon}</div>
                <div style={{
                  fontSize: '30px', fontWeight: '800', lineHeight: 1, marginBottom: '6px',
                  background: `linear-gradient(135deg, ${s.color}, rgba(255,255,255,0.6))`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.value.toLocaleString()}
                </div>
                <div style={{ fontSize: '9px', fontWeight: '700', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Activity chart */}
          {stats.activity.length > 0 && (
            <GlassSection title="Activity — 14 Days">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '56px' }}>
                {stats.activity.map(a => (
                  <div key={a.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
                    className="group">
                    <div style={{
                      width: '100%',
                      height: `${Math.max(3, (a.count / maxActivity) * 48)}px`,
                      background: a.count > 0
                        ? 'linear-gradient(180deg, #4fc3f7, #06b6d4)'
                        : 'rgba(255,255,255,0.06)',
                      borderRadius: '3px 3px 0 0',
                      opacity: a.count > 0 ? 0.8 : 1,
                      boxShadow: a.count > 0 ? '0 0 8px rgba(79,195,247,0.3)' : 'none',
                      transition: 'opacity 0.2s',
                    }} />
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                      style={{
                        fontSize: '10px', color: '#7dd3fc',
                        background: 'rgba(8,16,48,0.9)', backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(79,195,247,0.2)', padding: '2px 6px', borderRadius: '4px',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {stats.top_tags.map(t => {
                  const pct = (t.count / (stats.top_tags[0]?.count || 1)) * 100
                  return (
                    <div key={t.tag} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', width: '80px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tag}</span>
                      <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #4fc3f7, #818cf8)', borderRadius: '2px' }} />
                      </div>
                      <span style={{ fontSize: '11px', color: 'rgba(79,195,247,0.6)', minWidth: '20px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>
                    </div>
                  )
                })}
              </div>
            </GlassSection>
          )}

          {/* Recent */}
          {stats.recent.length > 0 && (
            <GlassSection title="Recent Sessions">
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {stats.recent.map((r, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(79,195,247,0.3)', flexShrink: 0, minWidth: '16px' }}>{i + 1}.</span>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.72)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
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
