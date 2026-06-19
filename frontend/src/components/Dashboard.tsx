import { useEffect, useState } from 'react'
import { getStats } from '../lib/api'
import type { Stats } from '../types'

interface Props { onClose: () => void }

function NeonSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-card font-mono" style={{ border: '1px solid rgba(0,255,225,0.2)' }}>
      <p className="text-xs text-dim-cyan tracking-widest mb-3">{title}</p>
      {children}
    </div>
  )
}

export default function Dashboard({ onClose }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => { getStats().then(setStats).catch(console.error) }, [])

  const maxActivity = stats ? Math.max(...stats.activity.map(a => a.count), 1) : 1

  return (
    <div className="flex flex-col h-full bg-surface font-mono">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,225,0.15)' }}
      >
        <div>
          <span className="text-xs text-accent tracking-widest">// RESEARCH_DASHBOARD</span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-dim-cyan hover:text-magenta transition-colors font-mono"
        >
          [×] CLOSE
        </button>
      </div>

      {!stats ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <span key={i} className="w-2 h-2 bg-accent typing-dot" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'SESSIONS',      value: stats.total_conversations, sym: '◈' },
              { label: 'REPORTS',       value: stats.total_reports,        sym: '◉' },
              { label: 'TOPICS',        value: stats.monitor.topics,       sym: '⬡' },
              { label: 'KNOWLEDGE',     value: stats.monitor.knowledge_items, sym: '✦' },
            ].map(s => (
              <div
                key={s.label}
                className="p-4 bg-card"
                style={{ border: '1px solid rgba(0,255,225,0.2)' }}
              >
                <div className="text-base text-muted mb-1">{s.sym}</div>
                <div
                  className="text-2xl font-bold text-accent"
                  style={{ textShadow: '0 0 10px rgba(0,255,225,0.4)' }}
                >
                  {s.value.toLocaleString()}
                </div>
                <div className="text-xs text-dim-cyan mt-0.5 tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Activity chart */}
          {stats.activity.length > 0 && (
            <NeonSection title="// RESEARCH_ACTIVITY (14d)">
              <div className="flex items-end gap-0.5 h-14">
                {stats.activity.map(a => (
                  <div key={a.date} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full transition-all cursor-default"
                      style={{
                        height: `${Math.max(3, (a.count / maxActivity) * 48)}px`,
                        background: '#00ffe1',
                        boxShadow: a.count > 0 ? '0 0 4px #00ffe1' : 'none',
                        opacity: a.count > 0 ? 0.8 : 0.15,
                      }}
                    />
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-card px-1 text-accent opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-mono"
                      style={{ border: '1px solid rgba(0,255,225,0.2)' }}>
                      {a.date}: {a.count}
                    </span>
                  </div>
                ))}
              </div>
            </NeonSection>
          )}

          {/* Top tags */}
          {stats.top_tags.length > 0 && (
            <NeonSection title="// TOP_TAGS">
              <div className="flex flex-col gap-2">
                {stats.top_tags.map(t => {
                  const pct = (t.count / (stats.top_tags[0]?.count || 1)) * 100
                  const filled = Math.round(pct / 10)
                  return (
                    <div key={t.tag} className="flex items-center gap-2 text-xs">
                      <span className="text-muted w-20 truncate">{t.tag}</span>
                      <span className="text-accent">{'█'.repeat(filled)}</span>
                      <span className="text-border">{'░'.repeat(10 - filled)}</span>
                      <span className="text-dim-cyan ml-1">{t.count}</span>
                    </div>
                  )
                })}
              </div>
            </NeonSection>
          )}

          {/* Recent */}
          {stats.recent.length > 0 && (
            <NeonSection title="// RECENT_RESEARCH">
              <ul className="flex flex-col gap-1.5">
                {stats.recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-magenta shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                    <span className="text-muted flex-1 truncate">{r.title}</span>
                    <span className="text-dim-cyan shrink-0">{new Date(r.updated_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </NeonSection>
          )}
        </div>
      )}
    </div>
  )
}
