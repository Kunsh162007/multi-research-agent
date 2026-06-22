import { useEffect, useRef, useState } from 'react'
import { getHistory, uploadFile, fetchUrl, exportReport } from '../lib/api'
import { useSSE } from '../hooks/useSSE'
import StreamRenderer from './StreamRenderer'
import FollowUpQuestions from './FollowUpQuestions'
import ExportButton from './ExportButton'
import ShareModal from './ShareModal'
import CommandPalette from './CommandPalette'
import { COMMANDS, parseLeadingCommand, type SlashCommand, type CommandAction } from '../lib/commands'
import type { ChatMessage, FinalEvent, ResearchConstraints, ResearchMode } from '../types'

interface Props {
  onConversationCreated: () => void
  loadThreadId?: string
  initialQuery?: string
}

interface ModeConfig {
  id: ResearchMode
  icon: string
  label: string
  short: string
  desc: string
  placeholder: string
  color: string
}

const MODES: ModeConfig[] = [
  {
    id: 'validate',
    icon: '⟳',
    label: 'Validate Idea',
    short: 'Validate',
    desc: 'Check if your idea already exists & discover what\'s novel',
    placeholder: 'Describe your idea or concept to validate against existing work…',
    color: '#fb923c',
  },
  {
    id: 'discover',
    icon: '⬡',
    label: 'Find Tools',
    short: 'Discover',
    desc: 'Find the best tools, libraries & frameworks for your use case',
    placeholder: 'What do you need to build or solve? (e.g. "vector search for RAG")…',
    color: '#f59e0b',
  },
  {
    id: 'explain',
    icon: '◇',
    label: 'Learn Concept',
    short: 'Learn',
    desc: 'Deep-dive into any technology or concept from basics to advanced',
    placeholder: 'What technology or concept would you like to understand deeply?…',
    color: '#fb923c',
  },
  {
    id: 'research',
    icon: '✦',
    label: 'Deep Research',
    short: 'Research',
    desc: 'Comprehensive academic research with citations & expert analysis',
    placeholder: 'Ask a research question for comprehensive analysis…',
    color: '#f97316',
  },
]

const AUDIENCES = ['general', 'technical', 'academic'] as const

const DEFAULT_CONSTRAINTS: ResearchConstraints = {
  mode: 'research',
  use_adaptive: true,
  use_reflexion: true,
  use_hyde: false,
  use_rag_fusion: false,
  use_storm: false,
  use_deep_crawl: false,
  use_consensus: false,
  max_iterations: 3,
  quality_target: 75,
}

const RAG_TOGGLES: [keyof ResearchConstraints, string, string][] = [
  ['use_adaptive',   'Adaptive',    'Auto-adjusts depth by query complexity'],
  ['use_reflexion',  'Reflexion',   'Self-critiques & retries when quality is low'],
  ['use_deep_crawl', 'Deep Search', 'SearXNG web-wide + follows links (every site)'],
  ['use_consensus',  'Consensus',   'Drafts on two models, judge merges the best'],
  ['use_hyde',       'HyDE',        'Generates hypothetical answer to anchor searches'],
  ['use_rag_fusion', 'RAG Fusion',  'Multi-query expansion with rank fusion'],
  ['use_storm',      'STORM',       'Expert personas each contribute unique angles'],
]

const MODE_SUGGESTIONS: Record<ResearchMode, string[]> = {
  validate: [
    'Is real-time collaborative editing on documents novel?',
    'Validate: multi-agent code review assistant',
    'Is personalized AI tutor based on learning style new?',
    'Check novelty of AI-powered music composition tool',
  ],
  discover: [
    'Best vector databases for production RAG 2025',
    'Top frameworks for building AI agents',
    'Best tools for real-time ML model serving',
    'Find alternatives to LangChain for LLM orchestration',
  ],
  explain: [
    'How does attention mechanism work in transformers?',
    'Explain RLHF — from basics to advanced',
    'What is Mixture of Experts (MoE)?',
    'How does RAG differ from fine-tuning?',
  ],
  research: [
    'Latest advances in RLHF for large language models',
    'Mamba vs Transformers: architecture comparison 2025',
    'State of multimodal AI and vision-language models',
    'RAG vs fine-tuning: comprehensive analysis',
  ],
}

export default function Chat({ onConversationCreated, loadThreadId, initialQuery }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<ResearchMode>('research')
  const [audience, setAudience] = useState<'general' | 'technical' | 'academic'>('general')
  const [constraints, setConstraints] = useState<ResearchConstraints>(DEFAULT_CONSTRAINTS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [shareThreadId, setShareThreadId] = useState<string | null>(null)
  const [attachedDocs, setAttachedDocs] = useState<{ name: string; chunks: number; docs: object[] }[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { state, start, reset } = useSSE()
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null)

  const activeModeConfig = MODES.find(m => m.id === mode) ?? MODES[3]

  useEffect(() => {
    if (!loadThreadId) return
    reset()
    setMessages([])
    getHistory(loadThreadId)
      .then(({ messages: msgs }) => {
        const loaded: ChatMessage[] = (msgs as any[]).map((m, i) => ({
          id: `${loadThreadId}-${i}`,
          role: m.role,
          content: m.content,
          events: [],
          thread_id: loadThreadId,
          timestamp: new Date(m.created_at),
          isStreaming: false,
          validation: m.metadata?.validation,
          report: m.role === 'assistant' ? m.content : undefined,
          sources: [],
        }))
        setMessages(loaded)
      })
      .catch(console.error)
  }, [loadThreadId])

  // Auto-run a query handed in from elsewhere (e.g. "Deep dive in chat" from the monitor).
  const ranInitial = useRef(false)
  useEffect(() => {
    if (initialQuery && !ranInitial.current) {
      ranInitial.current = true
      handleSubmit(initialQuery)
    }
  }, [initialQuery])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, state.events, state.report])

  useEffect(() => {
    if (!activeAssistantId) return
    setMessages(prev =>
      prev.map(m =>
        m.id === activeAssistantId
          ? {
              ...m,
              events: state.events,
              report: state.report,
              isStreaming: state.isStreaming,
              content: state.report,
              thread_id: state.threadId ?? m.thread_id,
              sources: state.sources,
            }
          : m,
      ),
    )
  }, [state.events, state.report, state.isStreaming, state.threadId, state.sources, activeAssistantId])

  useEffect(() => {
    if (!state.isStreaming && activeAssistantId && state.threadId) {
      const finalEvent = state.events.find((e): e is FinalEvent => e.type === 'final')
      setMessages(prev =>
        prev.map(m =>
          m.id === activeAssistantId
            ? { ...m, isStreaming: false, validation: finalEvent?.validation, sources: state.sources }
            : m,
        ),
      )
      onConversationCreated()
    }
  }, [state.isStreaming])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    try {
      const result = await uploadFile(file)
      setAttachedDocs(prev => [...prev, { name: result.filename, chunks: result.chunks, docs: result.docs }])
    } catch (err: any) {
      setUploadError(err.message)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleAddUrl() {
    const url = urlInput.trim()
    if (!url) return
    setUrlLoading(true)
    setUploadError(null)
    try {
      const result = await fetchUrl(url)
      setAttachedDocs(prev => [...prev, { name: url, chunks: result.chunks, docs: result.docs }])
      setUrlInput('')
    } catch (err: any) {
      setUploadError(err.message)
    } finally {
      setUrlLoading(false)
    }
  }

  const showPalette = /^\/[^\s]*$/.test(input)

  async function exportLatest(action: CommandAction) {
    const last = [...messages].reverse().find(m => m.role === 'assistant' && m.thread_id)
    if (!last?.thread_id) { setUploadError('Run a research first, then export.'); return }
    const fmt = action === 'export-docx' ? 'docx' : 'pdf'
    const style = action === 'export-paper' ? 'paper' : undefined
    try { await exportReport(last.thread_id, fmt, style) }
    catch (err: any) { setUploadError(err.message) }
  }

  function runAction(action: CommandAction) {
    if (action === 'upload') fileInputRef.current?.click()
    else if (action === 'help') setShowHelp(true)
    else exportLatest(action)
  }

  function selectCommand(c: SlashCommand) {
    if (c.action) { runAction(c.action); setInput(''); return }
    setInput(c.cmd + ' ')   // fill the command; user types the query, parsed on submit
    textareaRef.current?.focus()
  }

  async function handleSubmit(overrideQuery?: string) {
    const raw = (overrideQuery ?? input).trim()
    if (!raw || state.isStreaming) return

    // Resolve a leading /command (mode, constraints, or an immediate action).
    const parsed = parseLeadingCommand(raw)
    if (parsed.action) { runAction(parsed.action); setInput(''); return }
    const q = parsed.query.trim()
    if (!q) { setInput(''); return }

    const effMode: ResearchMode = parsed.mode ?? mode
    if (parsed.mode) setMode(parsed.mode)

    const allDocs = attachedDocs.flatMap(a => a.docs)
    const mergedConstraints: ResearchConstraints = { ...constraints, ...(parsed.patch ?? {}), mode: effMode }
    const userId = `user-${Date.now()}`
    const assistantId = `asst-${Date.now()}`
    setActiveAssistantId(assistantId)
    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', content: q, events: [], timestamp: new Date(), isStreaming: false },
      { id: assistantId, role: 'assistant', content: '', events: [], timestamp: new Date(), isStreaming: true, sources: [] },
    ])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await start(q, audience, undefined, mergedConstraints, allDocs)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // When the command palette is open, let it own navigation/selection keys.
    if (showPalette && ['Enter', 'ArrowUp', 'ArrowDown', 'Tab', 'Escape'].includes(e.key)) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }

  function toggleConstraint(key: keyof ResearchConstraints) {
    setConstraints(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const isEmpty = messages.length === 0

  function fmtTime(d: Date) {
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="chat-root">
      {shareThreadId && <ShareModal threadId={shareThreadId} onClose={() => setShareThreadId(null)} />}

      {/* Header */}
      <div className="chat-header">
        <div className="chat-title">
          {messages.length > 0
            ? (messages.find(m => m.role === 'user')?.content?.slice(0, 60) ?? 'Intelligence Lab')
            : 'Intelligence Lab'}
        </div>
        <div className="chat-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`mode-chip${mode === m.id ? ' active' : ''}`}
            >
              {m.icon} {m.short}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="empty-state">
          <div className="empty-logo">◆ Intelligence Lab ◆</div>
          <h1 className="empty-title">What would you like to explore?</h1>

          <div className="mode-cards">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`mode-card${mode === m.id ? ' selected' : ''}`}
                style={mode === m.id ? {
                  borderColor: `${m.color}60`,
                  background: `linear-gradient(135deg, ${m.color}12 0%, ${m.color}06 100%)`,
                  boxShadow: `0 0 0 1px ${m.color}30, 0 8px 32px ${m.color}12`,
                } : {}}
              >
                <span className="mode-card-icon" style={{ color: m.color }}>{m.icon}</span>
                <div className="mode-card-label" style={mode === m.id ? { color: m.color } : {}}>{m.label}</div>
                <div className="mode-card-desc">{m.desc}</div>
              </button>
            ))}
          </div>

          <div className="suggestions-grid">
            {(MODE_SUGGESTIONS[mode] ?? MODE_SUGGESTIONS.research).map(q => (
              <button
                key={q}
                onClick={() => { setInput(q); textareaRef.current?.focus() }}
                className="suggestion-chip"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {!isEmpty && (
        <div className="messages-area">
          {messages.map(msg => (
            <div key={msg.id} className="message-row">
              {msg.role === 'user' ? (
                <div className="user-message-wrap">
                  <div className="message-meta user-meta">
                    You · {fmtTime(msg.timestamp)}
                  </div>
                  <div className="user-bubble">{msg.content}</div>
                </div>
              ) : (
                <div className="assistant-message-wrap">
                  <div className="ai-header">
                    <div className="ai-avatar">✦</div>
                    <div>
                      <div className="ai-name">IntelLab</div>
                      <div className="ai-sources">
                        {msg.isStreaming ? 'Researching…' : `${fmtTime(msg.timestamp)}`}
                        {!msg.isStreaming && msg.thread_id && (
                          <span style={{ marginLeft: 8, color: 'var(--text-5)', fontSize: 10 }}>{msg.thread_id.slice(0, 8)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="assistant-card">
                    {msg.isStreaming || msg.events.length > 0 ? (
                      <StreamRenderer
                        events={msg.events}
                        report={msg.report ?? ''}
                        isStreaming={msg.isStreaming}
                        quality={state.quality}
                        iteration={state.iteration}
                        validation={msg.validation}
                        sources={msg.sources}
                      />
                    ) : msg.content ? (
                      <div className="report-body">
                        <p style={{ color: 'var(--text-2)', lineHeight: '1.8', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </p>
                      </div>
                    ) : null}

                    {msg.thread_id && !msg.isStreaming && (
                      <div className="action-bar">
                        <ExportButton threadId={msg.thread_id} report={msg.report ?? msg.content} />
                        <button
                          className="btn-ghost"
                          onClick={() => setShareThreadId(msg.thread_id!)}
                        >
                          Share
                        </button>
                      </div>
                    )}
                  </div>

                  {!msg.isStreaming && (msg.validation?.follow_up_questions?.length ?? 0) > 0 && (
                    <FollowUpQuestions
                      questions={msg.validation!.follow_up_questions!}
                      onSelect={handleSubmit}
                    />
                  )}
                </div>
              )}
            </div>
          ))}

          {state.error && (
            <div className="error-banner">{state.error}</div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div className="input-area">
        <div className="input-container">

          {/* Audience pills — Design A style */}
          <div className="audience-pills">
            <span className="audience-label">Audience:</span>
            {AUDIENCES.map(a => (
              <button
                key={a}
                onClick={() => setAudience(a)}
                className={`pill${audience === a ? ' active' : ''}`}
                style={{ textTransform: 'capitalize' }}
              >
                {a}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {constraints.use_deep_crawl && <span className="active-indicator deep">⌘ Deep Search</span>}
              {constraints.use_consensus && <span className="active-indicator">⚖ Consensus</span>}
              <button
                className={`options-btn${showAdvanced ? ' active' : ''}`}
                onClick={() => setShowAdvanced(v => !v)}
              >
                {showAdvanced ? '▴' : '▾'} Engine
              </button>
            </span>
          </div>

          {/* Advanced panel */}
          {showAdvanced && (
            <div className="advanced-panel">
              <p className="advanced-title">Search Engine Options</p>
              <div className="rag-grid">
                {RAG_TOGGLES.map(([key, label, desc]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleConstraint(key)}
                    className="rag-toggle"
                  >
                    <span className={`rag-check${constraints[key] ? ' on' : ''}`}>
                      {constraints[key] ? '◆' : '◇'}
                    </span>
                    <div>
                      <p className={`rag-label${constraints[key] ? ' on' : ''}`}>{label}</p>
                      <p className="rag-desc">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="advanced-controls">
                <label className="control-label">
                  Iterations
                  <input
                    type="number" min={1} max={10}
                    value={constraints.max_iterations ?? 3}
                    onChange={e => setConstraints(prev => ({
                      ...prev, max_iterations: Math.max(1, Math.min(10, Number(e.target.value)))
                    }))}
                    className="control-input"
                  />
                </label>
                <label className="control-label">
                  Quality bar
                  <input
                    type="number" min={0} max={100}
                    value={constraints.quality_target ?? 75}
                    onChange={e => setConstraints(prev => ({
                      ...prev, quality_target: Math.max(0, Math.min(100, Number(e.target.value)))
                    }))}
                    className="control-input"
                  />
                </label>
              </div>

              {/* URL input row */}
              <div className="url-input-row" style={{ marginTop: '12px', borderTop: '1px solid var(--glass-border)', paddingTop: '12px' }}>
                <input
                  type="url"
                  className="url-input"
                  placeholder="Paste a URL to include as context…"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
                />
                <button className="btn-primary" onClick={handleAddUrl} disabled={!urlInput.trim() || urlLoading}>
                  {urlLoading ? '…' : 'Add URL'}
                </button>
              </div>
            </div>
          )}

          {/* Attached context chips */}
          {attachedDocs.length > 0 && (
            <div className="attach-chips">
              {attachedDocs.map((a, i) => (
                <div key={i} className="attach-chip">
                  <span className="attach-icon">📄</span>
                  <span className="attach-name">{a.name.length > 30 ? '…' + a.name.slice(-28) : a.name}</span>
                  <span className="attach-count">{a.chunks} chunks</span>
                  <button className="attach-remove" onClick={() => setAttachedDocs(prev => prev.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}

          {uploadError && <div className="upload-error">{uploadError}</div>}

          {/* Command palette (Claude-Code style) */}
          {showPalette && (
            <CommandPalette
              filter={input.slice(1)}
              onSelect={selectCommand}
              onClose={() => setInput('')}
            />
          )}

          {/* Help panel */}
          {showHelp && (
            <div className="advanced-panel cmd-help">
              <p className="advanced-title">Slash commands — type <code>/</code> in the box</p>
              <div className="cmd-help-grid">
                {COMMANDS.map(c => (
                  <div key={c.cmd} className="cmd-help-row">
                    <span className="cmd-name">{c.cmd}</span>
                    <span className="cmd-desc">{c.desc}</span>
                  </div>
                ))}
              </div>
              <button className="btn-ghost" onClick={() => setShowHelp(false)}>Close</button>
            </div>
          )}

          {/* Textarea */}
          <input ref={fileInputRef} type="file"
            accept=".pdf,.docx,.doc,.txt,.md,.rst,.png,.jpg,.jpeg,.webp,.gif,.bmp,.mp3,.wav,.m4a,.ogg,.flac,.csv,.json,.xlsx,.xls"
            style={{ display: 'none' }} onChange={handleFileChange} />
          <div className="gold-input-row">
            <button className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach any file — image, audio, CSV, PDF, DOCX">⊕</button>
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder={activeModeConfig.placeholder}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={state.isStreaming}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || state.isStreaming}
              className="send-btn"
            >
              {state.isStreaming ? (
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.75s linear infinite' }} />
              ) : '↑'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
