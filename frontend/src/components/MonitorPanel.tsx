import { useEffect, useState } from 'react'
import { listTopics, addTopic, removeTopic, syncAll, syncTopic, getKnowledge, analyzeJobPost } from '../lib/api'
import type { Topic, KnowledgeItem } from '../types'

interface Props { onClose: () => void }
type PanelTab = 'monitor' | 'job'
type InputMode = 'position' | 'description'
type CompanyType = 'mnc' | 'startup' | 'organization' | 'other'

const COMPANY_TYPES: { id: CompanyType; label: string; desc: string }[] = [
  { id: 'mnc',          label: 'MNC',          desc: 'Large multinational corporation' },
  { id: 'startup',      label: 'Startup',       desc: 'Early-stage or growth company' },
  { id: 'organization', label: 'Organization',  desc: 'NGO, research institute, govt' },
  { id: 'other',        label: 'Other',         desc: 'Other type of company' },
]

const s = {
  surface: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' } as React.CSSProperties,
  input: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xs)', color: 'var(--text)', fontSize: 13,
    padding: '8px 11px', outline: 'none', fontFamily: 'var(--font-ui)', width: '100%',
  } as React.CSSProperties,
  label: { fontSize: 10, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6, display: 'block' },
}

export default function MonitorPanel({ onClose }: Props) {
  const [tab, setTab]               = useState<PanelTab>('monitor')
  const [topics, setTopics]         = useState<Topic[]>([])
  const [items, setItems]           = useState<KnowledgeItem[]>([])
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [newTopic, setNewTopic]     = useState('')
  const [syncing, setSyncing]       = useState(false)
  const [syncingTopic, setSyncingTopic] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  // Job tab
  const [inputMode, setInputMode]   = useState<InputMode>('position')
  const [jobPosition, setJobPosition] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState<CompanyType>('other')
  const [analyzing, setAnalyzing]   = useState(false)
  const [jobResult, setJobResult]   = useState<{ topics: string[]; role_summary: string } | null>(null)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [adding, setAdding]         = useState(false)

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

  async function handleSyncAll() {
    setSyncing(true); setSyncResult(null)
    const result = await syncAll().finally(() => setSyncing(false))
    const total = Object.values(result.synced as Record<string, number>).reduce((a, b) => a + b, 0)
    setSyncResult(`${topics.length} topics synced — ${total} new items`)
    setItems((await getKnowledge()).items)
  }

  async function handleSyncTopic(topic: string) {
    setSyncingTopic(topic)
    const result = await syncTopic(topic).finally(() => setSyncingTopic(null))
    setSyncResult(`"${topic}" — ${result.new_items} new items`)
    setItems((await getKnowledge(activeTopic ?? undefined)).items)
  }

  async function handleTopicClick(topic: string) {
    const t = activeTopic === topic ? null : topic
    setActiveTopic(t)
    setItems((await getKnowledge(t ?? undefined)).items)
  }

  async function handleAnalyze() {
    const hasInput = inputMode === 'position' ? jobPosition.trim() : jobDescription.trim()
    if (!hasInput) return
    setAnalyzing(true); setJobResult(null); setSelected(new Set())
    try {
      const result = await analyzeJobPost({
        job_position:    jobPosition,
        job_description: jobDescription,
        company_name:    companyName,
        company_type:    companyType,
      })
      setJobResult(result)
      setSelected(new Set(result.topics))
    } catch (e: any) {
      setSyncResult(`Analysis failed: ${e.message}`)
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleAddSelected() {
    if (selected.size === 0) return
    setAdding(true)
    for (const t of selected) await addTopic(t)
    setTopics(await listTopics())
    setSyncResult(`Added ${selected.size} topics`)
    setTab('monitor')
    setJobResult(null)
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'linear-gradient(135deg, var(--orange), var(--orange-2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>📡</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Knowledge Monitor</div>
              <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>Track topics · get alerts</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12 }}>Close ×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['monitor', 'job'] as PanelTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 500,
              border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
              fontFamily: 'var(--font-ui)',
              borderColor: tab === t ? 'rgba(249,115,22,0.35)' : 'var(--border)',
              background:  tab === t ? 'var(--orange-tint)' : 'transparent',
              color:       tab === t ? 'var(--orange-light)' : 'var(--text-4)',
            }}>
              {t === 'monitor' ? '📡 Topics' : '💼 From Job'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── Monitor tab ── */}
        {tab === 'monitor' && (<>
          {/* Add topic */}
          <div>
            <span style={s.label}>Track a Topic</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...s.input, flex: 1 }} placeholder="e.g. LLM Inference Optimization…"
                value={newTopic} onChange={e => setNewTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTopic()} />
              <button className="btn-primary" onClick={handleAddTopic} style={{ flexShrink: 0 }}>Add</button>
            </div>
          </div>

          {/* Topics */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={s.label}>Tracked ({topics.length})</span>
              <button onClick={handleSyncAll} disabled={syncing || topics.length === 0} className="btn-ghost"
                style={{ fontSize: 11, opacity: syncing || topics.length === 0 ? 0.4 : 1 }}>
                {syncing ? '⟳ Syncing…' : '↻ Sync All'}
              </button>
            </div>

            {syncResult && (
              <div style={{ fontSize: 11, color: 'var(--orange-light)', background: 'var(--orange-tint)',
                border: '1px solid rgba(249,115,22,0.2)', padding: '7px 11px', borderRadius: 'var(--radius-xs)',
                marginBottom: 10 }}>
                {syncResult}
              </div>
            )}

            {loading ? (
              <div style={{ display: 'flex', gap: 5, padding: '8px 0' }}>
                {[0,.2,.4].map((d,i) => <span key={i} className="typing-dot" style={{ width:5, height:5, background:'var(--orange-dim)', borderRadius:'50%', display:'inline-block', animationDelay:`${d}s` }} />)}
              </div>
            ) : topics.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' }}>No topics yet. Add one above or import from a job.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {topics.map(t => {
                  const active = activeTopic === t.topic
                  return (
                    <div key={t.topic} onClick={() => handleTopicClick(t.topic)} style={{
                      ...s.surface, padding: '9px 12px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 9,
                      borderColor: active ? 'rgba(249,115,22,0.3)' : 'var(--border)',
                      background: active ? 'var(--orange-tint)' : 'var(--surface)',
                      transition: 'all 0.15s',
                    }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
                        background: active ? 'var(--orange)' : 'var(--text-5)' }} />
                      <span style={{ flex:1, fontSize:13, color: active ? 'var(--text)' : 'var(--text-3)',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.topic}</span>
                      <button onClick={e => { e.stopPropagation(); handleSyncTopic(t.topic) }}
                        disabled={syncingTopic === t.topic} className="btn-ghost" style={{ fontSize:14, padding:'0 3px' }}>
                        {syncingTopic === t.topic ? '…' : '↻'}
                      </button>
                      <button onClick={e => { e.stopPropagation(); removeTopic(t.topic); setTopics(p => p.filter(x => x.topic !== t.topic)) }}
                        className="btn-ghost" style={{ fontSize:15, padding:'0 3px' }}>×</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <span style={s.label}>{activeTopic ? `Feed — ${activeTopic}` : 'All Intelligence'} ({items.length})</span>
            {items.length === 0 ? (
              <p style={{ fontSize:12, color:'var(--text-4)', fontStyle:'italic' }}>
                {activeTopic ? 'Nothing yet — try syncing.' : 'No items yet. Sync a topic.'}
              </p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {items.map(item => (
                  <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                    style={{ ...s.surface, display:'block', textDecoration:'none', padding:'10px 12px', transition:'border-color 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(249,115,22,0.25)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                    <div style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
                      <span style={{
                        fontSize:9, fontWeight:700, padding:'2px 7px',
                        border:`1px solid ${item.item_type==='arxiv' ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                        color: item.item_type==='arxiv' ? '#818cf8' : 'var(--text-4)',
                        background: item.item_type==='arxiv' ? 'rgba(99,102,241,0.07)' : 'var(--surface-2)',
                        borderRadius:4, textTransform:'uppercase' as const, flexShrink:0, marginTop:2,
                      }}>{item.item_type}</span>
                      <div style={{ minWidth:0 }}>
                        <p style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.45, marginBottom:3,
                          overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any }}>
                          {item.title}
                        </p>
                        <p style={{ fontSize:10, color:'var(--text-4)' }}>{new Date(item.discovered_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>)}

        {/* ── Job tab ── */}
        {tab === 'job' && (<>
          <p style={{ fontSize:12, color:'var(--text-3)', lineHeight:1.65, marginBottom:2 }}>
            Enter your job details — we'll extract the right knowledge domains to track based on the role and company.
          </p>

          {/* Input mode toggle */}
          <div>
            <span style={s.label}>Input type</span>
            <div style={{ display:'flex', gap:6 }}>
              {(['position','description'] as InputMode[]).map(m => (
                <button key={m} onClick={() => setInputMode(m)} style={{
                  flex:1, padding:'7px 0', borderRadius:'var(--radius-xs)', fontSize:12, fontWeight:500,
                  border:'1px solid', cursor:'pointer', transition:'all 0.15s', fontFamily:'var(--font-ui)',
                  borderColor: inputMode===m ? 'rgba(249,115,22,0.35)' : 'var(--border)',
                  background:  inputMode===m ? 'var(--orange-tint)' : 'var(--surface)',
                  color:       inputMode===m ? 'var(--orange-light)' : 'var(--text-3)',
                }}>
                  {m === 'position' ? '🏷 Job Title' : '📄 Job Description'}
                </button>
              ))}
            </div>
          </div>

          {/* Input field */}
          {inputMode === 'position' ? (
            <div>
              <span style={s.label}>Job Title / Position</span>
              <input style={s.input} placeholder="e.g. Senior ML Engineer, Product Manager AI…"
                value={jobPosition} onChange={e => setJobPosition(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()} />
            </div>
          ) : (
            <div>
              <span style={s.label}>Job Description</span>
              <textarea style={{ ...s.input, minHeight:130, resize:'vertical' as const, lineHeight:1.6 }}
                placeholder="Paste the full job description here…"
                value={jobDescription} onChange={e => setJobDescription(e.target.value)} />
            </div>
          )}

          {/* Company name */}
          <div>
            <span style={s.label}>Company Name</span>
            <input style={s.input} placeholder="e.g. Google, OpenAI, UNICEF…"
              value={companyName} onChange={e => setCompanyName(e.target.value)} />
          </div>

          {/* Company type */}
          <div>
            <span style={s.label}>Company Type</span>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {COMPANY_TYPES.map(c => (
                <button key={c.id} onClick={() => setCompanyType(c.id)} style={{
                  padding:'9px 12px', borderRadius:'var(--radius-xs)', textAlign:'left' as const, cursor:'pointer',
                  border:'1px solid', transition:'all 0.15s', fontFamily:'var(--font-ui)',
                  borderColor: companyType===c.id ? 'rgba(249,115,22,0.4)' : 'var(--border)',
                  background:  companyType===c.id ? 'var(--orange-tint)' : 'var(--surface)',
                }}>
                  <div style={{ fontSize:12, fontWeight:600, color: companyType===c.id ? 'var(--orange-light)' : 'var(--text)', marginBottom:2 }}>{c.label}</div>
                  <div style={{ fontSize:10, color:'var(--text-4)' }}>{c.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Analyze button */}
          <button onClick={handleAnalyze}
            disabled={analyzing || (inputMode==='position' ? !jobPosition.trim() : !jobDescription.trim())}
            className="btn-primary"
            style={{ width:'100%', justifyContent:'center', padding:'10px', fontSize:13 }}>
            {analyzing ? (
              <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                {[0,.2,.4].map((d,i) => <span key={i} className="typing-dot" style={{ width:5, height:5, background:'var(--orange-light)', borderRadius:'50%', display:'inline-block', animationDelay:`${d}s` }} />)}
                Analyzing…
              </span>
            ) : '✦ Extract Knowledge Tracks'}
          </button>

          {/* Results */}
          {jobResult && (
            <div style={{ animation:'fade-in 0.25s ease' }}>
              {jobResult.role_summary && (
                <div style={{ ...s.surface, padding:'10px 13px', marginBottom:12,
                  borderColor:'rgba(249,115,22,0.2)', background:'var(--orange-tint)' }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'var(--orange-dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Role</div>
                  <div style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.5 }}>{jobResult.role_summary}</div>
                </div>
              )}

              <span style={{ ...s.label, marginBottom:10 }}>Suggested Tracks ({jobResult.topics.length})</span>

              <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:12 }}>
                {jobResult.topics.map(topic => {
                  const on = selected.has(topic)
                  return (
                    <button key={topic} onClick={() => { const n=new Set(selected); on?n.delete(topic):n.add(topic); setSelected(n) }}
                      style={{ ...s.surface, padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:9,
                        textAlign:'left' as const, transition:'all 0.15s',
                        borderColor: on ? 'rgba(249,115,22,0.35)' : 'var(--border)',
                        background:  on ? 'var(--orange-tint)' : 'var(--surface)' }}>
                      <span style={{ width:15, height:15, borderRadius:4, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                        border:`1px solid ${on ? 'var(--orange)' : 'var(--border-2)'}`,
                        background: on ? 'var(--orange-tint-2)' : 'transparent', fontSize:9, color:'var(--orange)' }}>
                        {on ? '✓' : ''}
                      </span>
                      <span style={{ fontSize:13, color: on ? 'var(--text)' : 'var(--text-3)' }}>{topic}</span>
                    </button>
                  )
                })}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setSelected(new Set(jobResult.topics))} className="btn-ghost"
                  style={{ flex:1, padding:'8px', border:'1px solid var(--border)', borderRadius:'var(--radius-xs)' }}>
                  Select All
                </button>
                <button onClick={handleAddSelected} disabled={selected.size===0 || adding} className="btn-primary"
                  style={{ flex:2, justifyContent:'center', padding:'8px' }}>
                  {adding ? 'Adding…' : `+ Add ${selected.size} Tracks`}
                </button>
              </div>
            </div>
          )}
        </>)}
      </div>
    </div>
  )
}
