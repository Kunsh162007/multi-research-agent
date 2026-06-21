import { useEffect, useState } from 'react'
import { getStats } from '../lib/api'
import type { Stats } from '../types'

interface Props { onClose: () => void }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px 18px' }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
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
    { label: 'Sessions',     value: stats.total_conversations,     color: 'var(--orange-light)' },
    { label: 'Reports',      value: stats.total_reports,           color: '#818cf8' },
    { label: 'Topics',       value: stats.monitor.topics,          color: '#34d399' },
    { label: 'Intel Items',  value: stats.monitor.knowledge_items, color: 'var(--text-2)' },
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'linear-gradient(135deg, var(--orange), var(--orange-2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>📊</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Analytics</div>
              <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>Research overview</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12 }}>Close ×</button>
        </div>
      </div>

      {!stats ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 0.2, 0.4].map((d, i) => (
              <span key={i} className="typing-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--orange-dim)', display: 'inline-block', animationDelay: `${d}s` }} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {STAT_CARDS.map(s => (
              <div key={s.label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '14px 16px',
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 6 }}>
                  {s.value.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Activity chart */}
          {stats.activity.length > 0 && (
            <Section title="Activity — 14 Days">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 52 }}>
                {stats.activity.map(a => (
                  <div key={a.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }} title={`${a.date}: ${a.count}`}>
                    <div style={{
                      width: '100%',
                      height: `${Math.max(3, (a.count / maxActivity) * 44)}px`,
                      background: a.count > 0 ? 'linear-gradient(180deg, var(--orange-light), var(--orange-2))' : 'var(--surface-3)',
                      borderRadius: '3px 3px 0 0',
                      opacity: a.count > 0 ? 0.9 : 1,
                    }} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Top tags */}
          {stats.top_tags.length > 0 && (
            <Section title="Top Tags">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {stats.top_tags.map(t => {
                  const pct = (t.count / (stats.top_tags[0]?.count || 1)) * 100
                  return (
                    <div key={t.tag} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)', width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tag}</span>
                      <div style={{ flex: 1, height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--orange), var(--orange-light))', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--orange-light)', minWidth: 20, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Recent sessions */}
          {stats.recent.length > 0 && (
            <Section title="Recent Sessions">
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {stats.recent.map((r, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-5)', flexShrink: 0, minWidth: 16 }}>{i + 1}.</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-5)', flexShrink: 0 }}>{new Date(r.updated_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

        </div>
      )}
    </div>
  )
}
