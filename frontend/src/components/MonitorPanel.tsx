import { useEffect, useState } from 'react'
import { listTopics, addTopic, removeTopic, syncAll, syncTopic, getKnowledge, analyzeJobPost } from '../lib/api'
import type { Topic, KnowledgeItem } from '../types'

interface Props { onClose: () => void }

type PanelTab = 'monitor' | 'job'

export default function MonitorPanel({ onClose }: Props) {
  const [tab, setTab] = useState<PanelTab>('monitor')
  const [topics, setTopics] = useState<Topic[]>([])
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [newTopic, setNewTopic] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncingTopic, setSyncingTopic] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  // Job post tab state
  const [jobPost, setJobPost] = useState('')
  const [analyzingJob, setAnalyzingJob] = useState(false)
  const [jobResult, setJobResult] = useState<{ topics: string[]; role_summary: string } | null>(null)
  const [selectedJobTopics, setSelectedJobTopics] = useState<Set<string>>(new Set())
  const [addingJobTopics, setAddingJobTopics] = useState(false)

  useEffect(() => {
    Promise.all([listTopics(), getKnowledge()])
      .then(([t, k]) => { setTopics(t); setItems(k.items) })
      .finally(() => setLoading(false))
  }, [])

  async function handleAddTopic() {
    if (!newTopic.trim()) return
    await addTopic(newTopic.trim())
    setTopics(await listTopics())
    setNewTopic('')
  }

  async function handleRemoveTopic(topic: string) {
    await removeTopic(topic)
    setTopics(prev => prev.filter(t => t.topic !== topic))
    if (activeTopic === topic) setActiveTopic(null)
  }

  async function handleSyncAll() {
    setSyncing(true); setSyncResult(null)
    try {
      const result = await syncAll()
      const total = Object.values(result.synced as Record<string, number>).reduce((a, b) => a + b, 0)
      setSyncResult(`${topics.length} topics synced — ${total} new items`)
      setItems((await getKnowledge()).items)
    } finally { setSyncing(false) }
  }

  async function handleSyncTopic(topic: string) {
    setSyncingTopic(topic)
    try {
      const result = await syncTopic(topic)
      setSyncResult(`"${topic}" — ${result.new_items} new items`)
      setItems((await getKnowledge(activeTopic ?? undefined)).items)
    } finally { setSyncingTopic(null) }
  }

  async function handleTopicClick(topic: string) {
    const t = activeTopic === topic ? null : topic
    setActiveTopic(t)
    setItems((await getKnowledge(t ?? undefined)).items)
  }

  async function handleAnalyzeJobPost() {
    if (!jobPost.trim()) return
    setAnalyzingJob(true)
    setJobResult(null)
    setSelectedJobTopics(new Set())
    try {
      const result = await analyzeJobPost(jobPost)
      setJobResult(result)
      setSelectedJobTopics(new Set(result.topics))
    } catch (e: any) {
      setSyncResult(`Analysis failed: ${e.message}`)
    } finally {
      setAnalyzingJob(false)
    }
  }

  async function handleAddSelectedTopics() {
    if (selectedJobTopics.size === 0) return
    setAddingJobTopics(true)
    try {
      for (const topic of selectedJobTopics) {
        await addTopic(topic)
      }
      setTopics(await listTopics())
      setSyncResult(`Added ${selectedJobTopics.size} topics from job post`)
      setTab('monitor')
      setJobPost('')
      setJobResult(null)
    } finally {
      setAddingJobTopics(false)
    }
  }

  const glassPanel = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)',
    backdropFilter: 'blur(20px) saturate(150%)',
    WebkitBackdropFilter: 'blur(20px) saturate(150%)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
  } as React.CSSProperties

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.85)',
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
    fontFamily: 'system-ui, sans-serif',
    caretColor: '#4fc3f7',
  } as React.CSSProperties

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'rgba(4,10,30,0.6)', backdropFilter: 'blur(16px)' }}
    >
      {/* Header */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(8,16,48,0.7)',
        backdropFilter: 'blur(24px)',
      }}>
        <div className="flex items-center justify-between mb-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '6px',
              background: 'linear-gradient(135deg, #818cf8, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', boxShadow: '0 0 12px rgba(129,140,248,0.3)',
            }}>◈</div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: '0.02em' }}>
                Trend Radar
              </p>
              <p style={{ fontSize: '9px', color: 'rgba(129,140,248,0.6)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                Knowledge Monitor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: '10px', color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'color 0.2s',
              background: 'none', border: 'none', padding: '4px 8px',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)' }}
          >
            Close ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {([
            { id: 'monitor' as PanelTab, label: '◈ Topics', color: '#818cf8' },
            { id: 'job' as PanelTab, label: '⟳ From Job Post', color: '#4fc3f7' },
          ] as const).map(({ id, label, color }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '5px 14px', borderRadius: '20px',
                border: '1px solid',
                borderColor: tab === id ? `${color}55` : 'rgba(255,255,255,0.08)',
                background: tab === id ? `${color}15` : 'transparent',
                color: tab === id ? color : 'rgba(255,255,255,0.35)',
                fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.18s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>

        {/* ── Monitor Tab ── */}
        {tab === 'monitor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Add topic */}
            <section>
              <p style={{
                fontSize: '9px', fontWeight: '700', color: 'rgba(129,140,248,0.6)',
                letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px',
              }}>
                Track a Topic
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="e.g. LoRA fine-tuning techniques…"
                  value={newTopic}
                  onChange={e => setNewTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
                  onFocus={e => { (e.target as HTMLElement).style.borderColor = 'rgba(79,195,247,0.35)' }}
                  onBlur={e => { (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
                />
                <button
                  onClick={handleAddTopic}
                  className="btn-primary"
                  style={{ flexShrink: 0 }}
                >
                  Add
                </button>
              </div>
            </section>

            {/* Topics list */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <p style={{
                  fontSize: '9px', fontWeight: '700', color: 'rgba(129,140,248,0.6)',
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                }}>
                  Tracked ({topics.length})
                </p>
                <button
                  onClick={handleSyncAll}
                  disabled={syncing || topics.length === 0}
                  style={{
                    fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase',
                    border: '1px solid rgba(79,195,247,0.25)',
                    color: 'rgba(79,195,247,0.6)', background: 'rgba(79,195,247,0.05)',
                    padding: '4px 12px', cursor: 'pointer', transition: 'all 0.2s',
                    borderRadius: '20px',
                    opacity: (syncing || topics.length === 0) ? 0.4 : 1,
                  }}
                >
                  {syncing ? '⟳ Syncing…' : '↻ Sync All'}
                </button>
              </div>

              {syncResult && (
                <div style={{
                  fontSize: '11px', color: '#7dd3fc',
                  background: 'rgba(79,195,247,0.08)', border: '1px solid rgba(79,195,247,0.15)',
                  padding: '8px 12px', borderRadius: '8px', marginBottom: '10px',
                }}>
                  ◆ {syncResult}
                </div>
              )}

              {loading ? (
                <div style={{ display: 'flex', gap: '6px', padding: '8px 0', alignItems: 'center' }}>
                  {[0,0.2,0.4].map((d,i) => (
                    <span key={i} className="typing-dot" style={{
                      width: 5, height: 5, background: 'rgba(79,195,247,0.4)',
                      borderRadius: '50%', display: 'inline-block', animationDelay: `${d}s`,
                    }} />
                  ))}
                </div>
              ) : topics.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.22)', fontStyle: 'italic', lineHeight: 1.6 }}>
                  No topics tracked. Add one above or import from a job post.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {topics.map(t => {
                    const isActive = activeTopic === t.topic
                    return (
                      <div
                        key={t.topic}
                        onClick={() => handleTopicClick(t.topic)}
                        style={{
                          ...glassPanel,
                          padding: '10px 14px', cursor: 'pointer',
                          transition: 'all 0.18s',
                          borderColor: isActive ? 'rgba(79,195,247,0.3)' : 'rgba(255,255,255,0.08)',
                          background: isActive
                            ? 'linear-gradient(135deg, rgba(79,195,247,0.1) 0%, rgba(6,182,212,0.06) 100%)'
                            : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                          display: 'flex', alignItems: 'center', gap: '10px',
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: isActive ? '#4fc3f7' : 'rgba(255,255,255,0.2)',
                          boxShadow: isActive ? '0 0 8px rgba(79,195,247,0.5)' : 'none',
                        }} />
                        <span style={{
                          flex: 1, fontSize: '13px',
                          color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{t.topic}</span>
                        <button
                          onClick={e => { e.stopPropagation(); handleSyncTopic(t.topic) }}
                          disabled={syncingTopic === t.topic}
                          style={{
                            fontSize: '12px', color: 'rgba(79,195,247,0.4)', cursor: 'pointer',
                            background: 'none', border: 'none', padding: '0 4px', transition: 'color 0.2s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#4fc3f7' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(79,195,247,0.4)' }}
                        >
                          {syncingTopic === t.topic ? '…' : '↻'}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleRemoveTopic(t.topic) }}
                          style={{
                            fontSize: '14px', color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
                            background: 'none', border: 'none', padding: '0 4px', transition: 'color 0.2s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(252,165,165,0.6)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)' }}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Knowledge items */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <p style={{
                  fontSize: '9px', fontWeight: '700', color: 'rgba(129,140,248,0.6)',
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                }}>
                  {activeTopic ? `Feed — ${activeTopic}` : 'All Intelligence'}
                </p>
                <span style={{
                  fontSize: '10px', color: 'rgba(79,195,247,0.5)',
                  background: 'rgba(79,195,247,0.08)', border: '1px solid rgba(79,195,247,0.15)',
                  padding: '1px 7px', borderRadius: '12px',
                }}>[{items.length}]</span>
              </div>

              {items.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.22)', fontStyle: 'italic', lineHeight: 1.6 }}>
                  {activeTopic ? 'Nothing found. Try syncing.' : 'No items yet. Sync a topic.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {items.map(item => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        ...glassPanel,
                        display: 'block', textDecoration: 'none', padding: '12px 14px',
                        transition: 'all 0.18s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(79,195,247,0.25)'
                        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'
                        ;(e.currentTarget as HTMLElement).style.transform = 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <span style={{
                          fontSize: '9px', fontWeight: '700', padding: '2px 8px',
                          border: `1px solid ${item.item_type === 'arxiv' ? 'rgba(79,195,247,0.35)' : 'rgba(129,140,248,0.25)'}`,
                          color: item.item_type === 'arxiv' ? '#7dd3fc' : '#a5b4fc',
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          flexShrink: 0, marginTop: '2px',
                          background: item.item_type === 'arxiv' ? 'rgba(79,195,247,0.06)' : 'rgba(129,140,248,0.05)',
                          borderRadius: '4px',
                        }}>
                          {item.item_type}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.45, marginBottom: '4px' }}
                            className="line-clamp-2">
                            {item.title}
                          </p>
                          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
                            {new Date(item.discovered_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── Job Post Tab ── */}
        {tab === 'job' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <section>
              <p style={{
                fontSize: '9px', fontWeight: '700', color: 'rgba(79,195,247,0.6)',
                letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px',
              }}>
                Auto-Import from Job Post
              </p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: '14px' }}>
                Paste a job description and we'll extract the key technologies & trends you should track to stay competitive in that role.
              </p>

              <textarea
                style={{
                  ...inputStyle,
                  width: '100%', minHeight: '160px', resize: 'vertical',
                  display: 'block', lineHeight: '1.6', fontSize: '12px',
                }}
                placeholder="Paste the full job description here…"
                value={jobPost}
                onChange={e => setJobPost(e.target.value)}
                onFocus={e => { (e.target as HTMLElement).style.borderColor = 'rgba(79,195,247,0.35)' }}
                onBlur={e => { (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
              />

              <button
                onClick={handleAnalyzeJobPost}
                disabled={!jobPost.trim() || analyzingJob}
                className="btn-primary"
                style={{ marginTop: '10px', width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                {analyzingJob ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="typing-dot" style={{ width: 5, height: 5, background: '#7dd3fc', borderRadius: '50%', display: 'inline-block' }} />
                    <span className="typing-dot" style={{ width: 5, height: 5, background: '#7dd3fc', borderRadius: '50%', display: 'inline-block', animationDelay: '0.2s' }} />
                    <span className="typing-dot" style={{ width: 5, height: 5, background: '#7dd3fc', borderRadius: '50%', display: 'inline-block', animationDelay: '0.4s' }} />
                    Analyzing…
                  </span>
                ) : '⟳ Extract Topics'}
              </button>
            </section>

            {jobResult && (
              <section style={{ animation: 'fade-in 0.3s ease' }}>
                {jobResult.role_summary && (
                  <div style={{
                    ...glassPanel,
                    padding: '10px 14px', marginBottom: '14px',
                    borderColor: 'rgba(79,195,247,0.2)',
                    background: 'rgba(79,195,247,0.06)',
                  }}>
                    <p style={{ fontSize: '9px', fontWeight: '700', color: 'rgba(79,195,247,0.6)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '4px' }}>Role Summary</p>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{jobResult.role_summary}</p>
                  </div>
                )}

                <p style={{
                  fontSize: '9px', fontWeight: '700', color: 'rgba(79,195,247,0.6)',
                  letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px',
                }}>
                  Suggested Topics ({jobResult.topics.length})
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                  {jobResult.topics.map(topic => {
                    const selected = selectedJobTopics.has(topic)
                    return (
                      <button
                        key={topic}
                        onClick={() => {
                          const next = new Set(selectedJobTopics)
                          if (selected) next.delete(topic)
                          else next.add(topic)
                          setSelectedJobTopics(next)
                        }}
                        style={{
                          ...glassPanel,
                          padding: '10px 14px', cursor: 'pointer', border: '1px solid',
                          borderColor: selected ? 'rgba(79,195,247,0.4)' : 'rgba(255,255,255,0.08)',
                          background: selected
                            ? 'linear-gradient(135deg, rgba(79,195,247,0.12) 0%, rgba(6,182,212,0.07) 100%)'
                            : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                          display: 'flex', alignItems: 'center', gap: '10px',
                          transition: 'all 0.18s',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{
                          width: 16, height: 16, borderRadius: '4px', flexShrink: 0,
                          border: `1px solid ${selected ? 'rgba(79,195,247,0.5)' : 'rgba(255,255,255,0.15)'}`,
                          background: selected ? 'rgba(79,195,247,0.2)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '9px', color: '#4fc3f7',
                        }}>
                          {selected ? '✓' : ''}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          color: selected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
                        }}>{topic}</span>
                      </button>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setSelectedJobTopics(new Set(jobResult.topics))}
                    style={{
                      flex: 1, padding: '8px', border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
                      fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase',
                      cursor: 'pointer', borderRadius: '8px', transition: 'all 0.18s',
                    }}
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleAddSelectedTopics}
                    disabled={selectedJobTopics.size === 0 || addingJobTopics}
                    className="btn-primary"
                    style={{ flex: 2, justifyContent: 'center', padding: '8px' }}
                  >
                    {addingJobTopics ? 'Adding…' : `+ Add ${selectedJobTopics.size} Topics`}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
