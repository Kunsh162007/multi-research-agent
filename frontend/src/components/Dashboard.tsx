import { useEffect, useState } from 'react'
import { getStats } from '../lib/api'
import type { Stats } from '../types'

interface Props { onClose: () => void }

export default function Dashboard({ onClose }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => { getStats().then(setStats).catch(console.error) }, [])

  const maxActivity = stats ? Math.max(...stats.activity.map(a => a.count), 1) : 1

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <h2 className="font-semibold text-white">Research Dashboard</h2>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {!stats ? (
        <div className="flex-1 flex items-center justify-center"><div className="flex gap-1.5">{[0,1,2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-accent typing-dot" style={{animationDelay:`${i*0.2}s`}} />)}</div></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Research Sessions', value: stats.total_conversations, icon: '📄', color: 'text-indigo-400' },
              { label: 'Reports Generated', value: stats.total_reports, icon: '📝', color: 'text-green-400' },
              { label: 'Topics Monitored', value: stats.monitor.topics, icon: '⚡', color: 'text-yellow-400' },
              { label: 'Knowledge Items', value: stats.monitor.knowledge_items, icon: '🔬', color: 'text-pink-400' },
            ].map(s => (
              <div key={s.label} className="card p-4">
                <div className="text-xl mb-1">{s.icon}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
                <div className="text-xs text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Activity chart */}
          {stats.activity.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Research Activity (14 days)</h3>
              <div className="flex items-end gap-1 h-16">
                {stats.activity.map(a => (
                  <div key={a.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className="w-full bg-accent/60 hover:bg-accent rounded-sm transition-all cursor-default"
                      style={{ height: `${Math.max(4, (a.count / maxActivity) * 56)}px` }}
                    />
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-card px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {a.date}: {a.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top tags */}
          {stats.top_tags.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Top Tags</h3>
              <div className="flex flex-col gap-2">
                {stats.top_tags.map(t => (
                  <div key={t.tag} className="flex items-center gap-2">
                    <span className="text-sm text-white w-24 truncate">{t.tag}</span>
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${(t.count / (stats.top_tags[0]?.count || 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted font-mono w-4 text-right">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent */}
          {stats.recent.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Recent Research</h3>
              <ul className="flex flex-col gap-1.5">
                {stats.recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-muted text-xs font-mono">{i + 1}.</span>
                    <span className="text-sm text-white flex-1 truncate">{r.title}</span>
                    <span className="text-xs text-muted shrink-0">{new Date(r.updated_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
