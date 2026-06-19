import { useEffect, useState } from 'react'
import { getStats } from '../lib/api'
import type { Stats } from '../types'

interface Props { onClose: () => void }

function GoldSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#181612', border: '1px solid rgba(212,168,71,0.1)', padding: '20px 24px' }}>
      <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '16px' }}>
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

  return (
    <div className="flex flex-col h-full" style={{ background: '#0c0c0c' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid rgba(212,168,71,0.1)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '4px' }}>
              ◆ &nbsp; Research Dashboard
            </p>
            <div style={{ color: 'rgba(212,168,71,0.15)', fontSize: '11px', letterSpacing: '0.04em', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              ══════════════════════════════════
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(245,240,232,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'color 0.2s', background: 'none', border: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.7)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.3)' }}
          >
            Close ×
          </button>
        </div>
      </div>

      {!stats ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1.5">
            <span className="w-2 h-2 bg-accent typing-dot" />
            <span className="w-2 h-2 bg-accent typing-dot" />
            <span className="w-2 h-2 bg-accent typing-dot" />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-4" style={{ padding: '20px 28px' }}>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Sessions',  value: stats.total_conversations, sym: '◈' },
              { label: 'Reports',   value: stats.total_reports,        sym: '◉' },
              { label: 'Topics',    value: stats.monitor.topics,       sym: '⬡' },
              { label: 'Knowledge', value: stats.monitor.knowledge_items, sym: '✦' },
            ].map(s => (
              <div key={s.label} style={{ background: '#181612', border: '1px solid rgba(212,168,71,0.1)', padding: '18px 20px' }}>
                <div style={{ color: 'rgba(212,168,71,0.35)', fontSize: '16px', marginBottom: '8px' }}>{s.sym}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '28px', color: '#d4a847', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {s.value.toLocaleString()}
                </div>
                <div style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(245,240,232,0.25)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '6px' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Activity chart */}
          {stats.activity.length > 0 && (
            <GoldSection title="Research Activity — 14 Days">
              <div className="flex items-end gap-0.5 h-14">
                {stats.activity.map(a => (
                  <div key={a.date} className="flex-1 flex flex-col items-center group relative">
                    <div
                      style={{
                        width: '100%',
                        height: `${Math.max(3, (a.count / maxActivity) * 48)}px`,
                        background: '#d4a847',
                        opacity: a.count > 0 ? 0.7 : 0.1,
                        transition: 'opacity 0.2s',
                      }}
                    />
                    <span
                      className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                      style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: '#d4a847', background: '#181612', border: '1px solid rgba(212,168,71,0.2)', padding: '1px 6px' }}
                    >
                      {a.date}: {a.count}
                    </span>
                  </div>
                ))}
              </div>
            </GoldSection>
          )}

          {/* Top tags */}
          {stats.top_tags.length > 0 && (
            <GoldSection title="Top Tags">
              <div className="flex flex-col gap-2.5">
                {stats.top_tags.map(t => {
                  const pct = (t.count / (stats.top_tags[0]?.count || 1)) * 100
                  return (
                    <div key={t.tag} className="flex items-center gap-3">
                      <span style={{ fontSize: '12px', color: 'rgba(245,240,232,0.45)', fontFamily: "'Segoe UI', system-ui, sans-serif", width: '80px', flexShrink: 0 }} className="truncate">{t.tag}</span>
                      <div style={{ flex: 1, height: '2px', background: 'rgba(212,168,71,0.08)', borderRadius: '1px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#d4a847', opacity: 0.6 }} />
                      </div>
                      <span style={{ fontSize: '11px', fontFamily: 'Georgia, serif', color: 'rgba(212,168,71,0.5)', minWidth: '20px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>
                    </div>
                  )
                })}
              </div>
            </GoldSection>
          )}

          {/* Recent */}
          {stats.recent.length > 0 && (
            <GoldSection title="Recent Research">
              <ul className="flex flex-col gap-2.5">
                {stats.recent.map((r, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span style={{ fontSize: '12px', fontFamily: 'Georgia, serif', color: 'rgba(212,168,71,0.4)', fontStyle: 'italic', flexShrink: 0, minWidth: '18px' }}>
                      {['I','II','III','IV','V','VI','VII','VIII','IX','X'][i] ?? String(i + 1)}
                    </span>
                    <span style={{ fontSize: '12px', color: 'rgba(245,240,232,0.5)', fontFamily: "'Segoe UI', system-ui, sans-serif", flex: 1 }} className="truncate">{r.title}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(212,168,71,0.3)', fontFamily: "'Segoe UI', system-ui, sans-serif", flexShrink: 0 }}>
                      {new Date(r.updated_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </GoldSection>
          )}
        </div>
      )}
    </div>
  )
}
