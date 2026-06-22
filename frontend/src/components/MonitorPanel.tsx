import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { listTopics, addTopic, removeTopic, syncAll, syncTopic, analyzeJobPost, getBriefing, refreshBriefing, getNewCounts, askBriefing, markVisited } from '../lib/api'
import type { Topic, Briefing } from '../types'

interface Props { onClose: () => void; onDeepDive: (query: string) => void }
type PanelTab = 'monitor' | 'job'
type InputMode = 'position' | 'description'
type CompanyType = 'mnc' | 'startup' | 'organization' | 'other'

const COMPANY_TYPES: { id: CompanyType; label: string; desc: string }[] = [
  { id: 'mnc',          label: 'MNC',          desc: 'Large multinational corporation' },
  { id: 'startup',      label: 'Startup',       desc: 'Early-stage or growth company' },
  { id: 'organization', label: 'Organization',  desc: 'NGO, research institute, govt' },
  { id: 'other',        label: 'Other',         desc: 'Other type of company' },
]

function timeAgo(iso: string): { label: string; stale: boolean } {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  const stale = mins > 7 * 24 * 60          // older than 7 days → nudge a refresh
  if (mins < 60)  return { label: `${mins}m ago`, stale }
  const hrs = Math.round(mins / 60)
  if (hrs < 24)   return { label: `${hrs}h ago`, stale }
  return { label: `${Math.round(hrs / 24)}d ago`, stale }
}

const s = {
  surface: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' } as React.CSSProperties,
  input: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xs)', color: 'var(--text)', fontSize: 13,
    padding: '8px 11px', outline: 'none', fontFamily: 'var(--font-ui)', width: '100%',
  } as React.CSSProperties,
  label: { fontSize: 10, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6, display: 'block' },
}

export default function MonitorPanel({ onClose, onDeepDive }: Props) {
  const [tab, setTab]               = useState<PanelTab>('monitor')
  const [topics, setTopics]         = useState<Topic[]>([])
  const [newCounts, setNewCounts]   = useState<Record<string, number>>({})
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [briefing, setBriefing]     = useState<Briefing | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [askInput, setAskInput]     = useState('')
  const [askAnswer, setAskAnswer]   = useState<string | null>(null)
  const [asking, setAsking]         = useState(false)
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
    Promise.all([listTopics(), getNewCounts()])
      .then(([t, nc]) => {
        setTopics(t)
        setNewCounts(nc.counts)
        if (t.length > 0) {                  // auto-open the most recent topic's briefing
          setActiveTopic(t[0].topic)
          loadBriefing(t[0].topic)
        }
      })
      .finally(() => { setLoading(false); markVisited().catch(() => {}) })
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
    if (activeTopic) loadBriefing(activeTopic)
  }

  async function loadBriefing(topic: string) {
    setBriefingLoading(true)
    setShowSources(false); setAskAnswer(null); setAskInput('')
    try { setBriefing(await getBriefing(topic)) }
    catch { setBriefing(null) }          // 404 = not synced yet
    finally { setBriefingLoading(false) }
  }

  async function handleSyncTopic(topic: string) {
    setSyncingTopic(topic)
    const result = await syncTopic(topic).finally(() => setSyncingTopic(null))
    setSyncResult(`"${topic}" — ${result.new_items} new items`)
    if (activeTopic === topic) loadBriefing(topic)   // sync refreshes the briefing server-side
  }

  async function handleRegenerateBriefing() {
    if (!activeTopic) return
    setBriefingLoading(true)
    try { setBriefing(await refreshBriefing(activeTopic)) }
    catch (e: any) { setSyncResult(e.message) }
    finally { setBriefingLoading(false) }
  }

  async function handleTopicClick(topic: string) {
    const t = activeTopic === topic ? null : topic
    setActiveTopic(t)
    if (t) loadBriefing(t)
    else { setBriefing(null); setAskAnswer(null) }
  }

  async function handleAsk() {
    if (!activeTopic || !askInput.trim()) return
    setAsking(true); setAskAnswer(null)
    try { setAskAnswer((await askBriefing(activeTopic, askInput.trim())).answer) }
    catch (e: any) { setAskAnswer(`Couldn't answer: ${e.message}`) }
    finally { setAsking(false) }
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
                      {newCounts[t.topic] > 0 && (
                        <span title={`${newCounts[t.topic]} new since your last visit`} style={{
                          fontSize:9, fontWeight:700, letterSpacing:'0.04em', flexShrink:0,
                          color:'var(--orange-light)', background:'var(--orange-tint)',
                          border:'1px solid rgba(249,115,22,0.3)', borderRadius:10, padding:'1px 6px' }}>
                          {newCounts[t.topic]} NEW
                        </span>
                      )}
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

          {/* Per-topic briefing — auto-shown for the active topic */}
          {activeTopic && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <span style={s.label}>Briefing — {activeTopic}</span>
                <button onClick={handleRegenerateBriefing} disabled={briefingLoading} className="btn-ghost"
                  style={{ fontSize:11, opacity: briefingLoading ? 0.4 : 1 }}>
                  {briefingLoading ? '⟳ Briefing…' : '✦ Regenerate'}
                </button>
              </div>

              {briefingLoading && !briefing ? (
                <div style={{ display:'flex', gap:5, padding:'8px 0' }}>
                  {[0,.2,.4].map((d,i) => <span key={i} className="typing-dot" style={{ width:5, height:5, background:'var(--orange-dim)', borderRadius:'50%', display:'inline-block', animationDelay:`${d}s` }} />)}
                </div>
              ) : briefing ? (<>
                <div style={{ ...s.surface, padding:'14px 16px' }}>
                  <div className="report-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.briefing}</ReactMarkdown>
                  </div>

                  {/* References — collapsed, abbreviated, under the briefing */}
                  {briefing.refs.length > 0 && (
                    <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                      <button onClick={() => setShowSources(v => !v)} className="btn-ghost"
                        style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', padding:0 }}>
                        {showSources ? '▾' : '▸'} Sources ({briefing.refs.length})
                      </button>
                      {showSources && (
                        <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:8 }}>
                          {briefing.refs.map((r, i) => (
                            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                              style={{ display:'flex', gap:7, alignItems:'baseline', textDecoration:'none',
                                fontSize:11, color:'var(--text-3)' }}>
                              <span style={{ color:'var(--text-5)', flexShrink:0 }}>[{i+1}]</span>
                              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title}</span>
                              <span style={{ fontSize:9, color:'var(--text-5)', textTransform:'uppercase', flexShrink:0 }}>· {r.type}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Freshness + deep dive */}
                  <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)',
                    display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    {(() => { const f = timeAgo(briefing.updated_at); return (
                      <span style={{ fontSize:10, color: f.stale ? 'var(--orange-light)' : 'var(--text-4)' }}>
                        {briefing.item_count} sources · {f.stale ? `⚠ synced ${f.label} — refresh` : `synced ${f.label}`}
                      </span>
                    )})()}
                    <button onClick={() => onDeepDive(`Give me a deep, up-to-date research briefing on ${activeTopic}, covering the latest developments and why they matter.`)}
                      className="btn-ghost" style={{ fontSize:11, color:'var(--orange-light)', flexShrink:0 }}>
                      ⤢ Deep dive in chat
                    </button>
                  </div>
                </div>

                {/* Ask this briefing */}
                <div style={{ marginTop:10 }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <input style={{ ...s.input, flex:1 }} placeholder={`Ask about ${activeTopic}…`}
                      value={askInput} onChange={e => setAskInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAsk()} />
                    <button className="btn-primary" onClick={handleAsk} disabled={asking || !askInput.trim()} style={{ flexShrink:0 }}>
                      {asking ? '…' : 'Ask'}
                    </button>
                  </div>
                  {askAnswer && (
                    <div style={{ ...s.surface, padding:'12px 14px', marginTop:8 }}>
                      <div className="report-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{askAnswer}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </>) : (
                <p style={{ fontSize:12, color:'var(--text-4)', fontStyle:'italic' }}>
                  No briefing yet — sync this topic (↻) to generate one.
                </p>
              )}
            </div>
          )}
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
