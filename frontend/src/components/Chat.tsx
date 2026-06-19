import { useEffect, useRef, useState } from 'react'
import { getHistory, uploadFile, fetchUrl } from '../lib/api'
import { useSSE } from '../hooks/useSSE'
import StreamRenderer from './StreamRenderer'
import FollowUpQuestions from './FollowUpQuestions'
import ExportButton from './ExportButton'
import ShareModal from './ShareModal'
import type { ChatMessage, FinalEvent, ResearchConstraints } from '../types'

interface Props {
  onConversationCreated: () => void
  loadThreadId?: string
}

const AUDIENCES = ['general', 'technical', 'academic'] as const

const DEFAULT_CONSTRAINTS: ResearchConstraints = {
  use_adaptive: true,
  use_reflexion: true,
  use_hyde: false,
  use_rag_fusion: false,
  use_storm: false,
  max_iterations: 3,
  quality_target: 75,
}

const RAG_TOGGLES: [keyof ResearchConstraints, string, string][] = [
  ['use_adaptive',  'Adaptive',   'Auto-adjusts search depth by query complexity'],
  ['use_reflexion', 'Reflexion',  'Self-critiques & retries when quality is low'],
  ['use_hyde',      'HyDE',       'Generates a hypothetical answer to anchor searches'],
  ['use_rag_fusion','RAG Fusion', 'Runs multiple queries, merges via rank scoring'],
  ['use_storm',     'STORM',      'Expert personas each contribute unique angles'],
]

const SUGGESTIONS = [
  'Latest advances in RLHF for large language models',
  'Mamba vs Transformers: architecture comparison',
  'State of multimodal AI in 2025',
  'RAG vs fine-tuning: when to use each',
]

export default function Chat({ onConversationCreated, loadThreadId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [audience, setAudience] = useState<'general' | 'technical' | 'academic'>('general')
  const [constraints, setConstraints] = useState<ResearchConstraints>(DEFAULT_CONSTRAINTS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [shareThreadId, setShareThreadId] = useState<string | null>(null)
  const [attachedDocs, setAttachedDocs] = useState<{ name: string; chunks: number; docs: object[] }[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { state, start, reset } = useSSE()
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null)

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

  async function handleSubmit(overrideQuery?: string) {
    const q = (overrideQuery ?? input).trim()
    if (!q || state.isStreaming) return

    const allDocs = attachedDocs.flatMap(a => a.docs)
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
    await start(q, audience, undefined, constraints, allDocs)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
        <div className="chat-header-title">
          <span className="status-dot" />
          Research Session
        </div>
        <div className="chat-header-sub">Self-RAG · Groq · {AUDIENCES.map(a => (
          <button
            key={a}
            onClick={() => setAudience(a)}
            className={`audience-chip${audience === a ? ' active' : ''}`}
          >
            {a}
          </button>
        ))}</div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="empty-state">
          <div className="empty-logo">Research AI</div>
          <p className="empty-sub">What would you like to explore today?</p>
          <div className="suggestions-grid">
            {SUGGESTIONS.map(q => (
              <button
                key={q}
                onClick={() => setInput(q)}
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
                  <div className="message-meta assistant-meta">
                    Research AI · {fmtTime(msg.timestamp)}
                    {!msg.isStreaming && msg.thread_id && (
                      <span className="thread-id">{msg.thread_id.slice(0, 8)}</span>
                    )}
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
                        <ExportButton threadId={msg.thread_id} />
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

          {/* Advanced panel */}
          {showAdvanced && (
            <div className="advanced-panel">
              <p className="advanced-title">RAG Options</p>
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
                  Max iterations
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
                  Quality target
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
            </div>
          )}

          {/* Toolbar */}
          <div className="input-toolbar">
            <button
              className={`btn-ghost options-btn${showAdvanced ? ' active' : ''}`}
              onClick={() => setShowAdvanced(v => !v)}
            >
              {showAdvanced ? '▴' : '▾'} Options
            </button>
          </div>

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

          {/* URL input row */}
          {showAdvanced && (
            <div className="url-input-row">
              <input
                type="url"
                className="url-input"
                placeholder="Paste a URL to include as context…"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
              />
              <button className="btn-primary" onClick={handleAddUrl} disabled={!urlInput.trim() || urlLoading}>
                {urlLoading ? '…' : 'Add'}
              </button>
            </div>
          )}

          {uploadError && <div className="upload-error">{uploadError}</div>}

          {/* Textarea */}
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.rst" style={{ display: 'none' }} onChange={handleFileChange} />
          <div className="gold-input-row">
            <button className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file (PDF, DOCX, TXT)">⊕</button>
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Ask a research question…"
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
                <span className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent typing-dot" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent typing-dot" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent typing-dot" />
                </span>
              ) : 'Research ↑'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
