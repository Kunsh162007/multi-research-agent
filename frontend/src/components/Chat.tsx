import { useEffect, useRef, useState } from 'react'
import { getHistory } from '../lib/api'
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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
          ? { ...m, events: state.events, report: state.report, isStreaming: state.isStreaming, content: state.report, thread_id: state.threadId ?? m.thread_id }
          : m,
      ),
    )
  }, [state.events, state.report, state.isStreaming, state.threadId, activeAssistantId])

  useEffect(() => {
    if (!state.isStreaming && activeAssistantId && state.threadId) {
      const finalEvent = state.events.find((e): e is FinalEvent => e.type === 'final')
      setMessages(prev =>
        prev.map(m =>
          m.id === activeAssistantId
            ? { ...m, isStreaming: false, validation: finalEvent?.validation }
            : m,
        ),
      )
      onConversationCreated()
    }
  }, [state.isStreaming])

  async function handleSubmit(overrideQuery?: string) {
    const q = (overrideQuery ?? input).trim()
    if (!q || state.isStreaming) return

    const userId = `user-${Date.now()}`
    const assistantId = `asst-${Date.now()}`
    setActiveAssistantId(assistantId)
    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', content: q, events: [], timestamp: new Date(), isStreaming: false },
      { id: assistantId, role: 'assistant', content: '', events: [], timestamp: new Date(), isStreaming: true },
    ])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await start(q, audience, undefined, constraints)
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
    <div className="flex flex-col h-full" style={{ background: '#0c0c0c' }}>
      {shareThreadId && <ShareModal threadId={shareThreadId} onClose={() => setShareThreadId(null)} />}

      {/* Header */}
      <div style={{ padding: '20px 36px 16px', borderBottom: '1px solid rgba(212,168,71,0.1)' }}>
        <div style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.5)', letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="status-dot" />
          Active Research Session
        </div>
        <div style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.25)', letterSpacing: '0.05em', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          ══════════════════════════════════ Self-RAG · Groq Backend
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
          <div className="text-center">
            <div style={{ color: '#d4a847', fontSize: '32px', letterSpacing: '0.12em', marginBottom: '10px' }}>
              ◆ RESEARCH AI
            </div>
            <div style={{
              height: '1px', width: '240px', margin: '0 auto 14px',
              background: 'linear-gradient(90deg, transparent, #d4a847, transparent)',
              opacity: 0.4,
            }} />
            <p style={{ fontSize: '13px', color: 'rgba(245,240,232,0.3)', fontStyle: 'italic' }}>
              Begin your inquiry below
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center max-w-xl">
            {SUGGESTIONS.map(q => (
              <button
                key={q}
                onClick={() => setInput(q)}
                style={{
                  fontSize: '12px',
                  fontFamily: "'Segoe UI', system-ui, sans-serif",
                  padding: '7px 14px',
                  border: '1px solid rgba(212,168,71,0.12)',
                  background: 'rgba(212,168,71,0.03)',
                  color: 'rgba(245,240,232,0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = 'rgba(212,168,71,0.3)'
                  el.style.color = 'rgba(245,240,232,0.7)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = 'rgba(212,168,71,0.12)'
                  el.style.color = 'rgba(245,240,232,0.4)'
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {!isEmpty && (
        <div className="flex-1 overflow-y-auto flex flex-col gap-6" style={{ padding: '28px 36px' }}>
          {messages.map(msg => (
            <div key={msg.id} className="flex flex-col gap-2">
              {msg.role === 'user' ? (
                <>
                  <div style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px' }}>
                    ◇ &nbsp; Researcher · {fmtTime(msg.timestamp)}
                  </div>
                  <div style={{
                    maxWidth: '560px',
                    borderLeft: '2px solid rgba(212,168,71,0.45)',
                    padding: '12px 18px',
                    background: 'rgba(212,168,71,0.03)',
                    fontSize: '14px',
                    lineHeight: 1.75,
                    color: 'rgba(245,240,232,0.75)',
                    fontStyle: 'italic',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px' }}>
                    ◆ &nbsp; Research AI · {fmtTime(msg.timestamp)}
                    {!msg.isStreaming && msg.thread_id && (
                      <span style={{ color: 'rgba(245,240,232,0.15)', marginLeft: '10px', letterSpacing: '0.05em', fontSize: '8px' }}>
                        {msg.thread_id.slice(0, 8)}
                      </span>
                    )}
                  </div>

                  <div style={{ background: '#181612', border: '1px solid rgba(212,168,71,0.12)', padding: '24px 28px' }}>
                    {msg.isStreaming || msg.events.length > 0 ? (
                      <StreamRenderer
                        events={msg.events}
                        report={msg.report ?? ''}
                        isStreaming={msg.isStreaming}
                        quality={state.quality}
                        iteration={state.iteration}
                        validation={msg.validation}
                      />
                    ) : msg.content ? (
                      <div className="report-body">
                        <p style={{ color: 'rgba(245,240,232,0.65)', lineHeight: '1.85', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </p>
                      </div>
                    ) : null}

                    {/* Action bar */}
                    {msg.thread_id && !msg.isStreaming && (
                      <div
                        className="flex items-center gap-3 mt-4 pt-4 flex-wrap"
                        style={{ borderTop: '1px solid rgba(212,168,71,0.08)' }}
                      >
                        <ExportButton threadId={msg.thread_id} />
                        <button
                          onClick={() => setShareThreadId(msg.thread_id!)}
                          style={{
                            fontSize: '10px',
                            fontFamily: "'Segoe UI', system-ui, sans-serif",
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            border: '1px solid rgba(212,168,71,0.2)',
                            color: 'rgba(212,168,71,0.5)',
                            background: 'transparent',
                            padding: '4px 12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#d4a847'; el.style.borderColor = 'rgba(212,168,71,0.5)' }}
                          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(212,168,71,0.5)'; el.style.borderColor = 'rgba(212,168,71,0.2)' }}
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
                </>
              )}
            </div>
          ))}

          {state.error && (
            <div style={{ padding: '12px 18px', border: '1px solid rgba(200,80,60,0.3)', color: 'rgba(200,80,60,0.8)', fontSize: '13px' }}>
              {state.error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div style={{ padding: '14px 36px 22px', borderTop: '1px solid rgba(212,168,71,0.1)', background: '#0c0c0c' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {/* Advanced RAG panel */}
          {showAdvanced && (
            <div style={{ marginBottom: '12px', padding: '16px 20px', background: '#181612', border: '1px solid rgba(212,168,71,0.12)' }}>
              <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>
                RAG Options
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
                {RAG_TOGGLES.map(([key, label, desc]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleConstraint(key)}
                    className="flex items-start gap-2.5 text-left cursor-pointer"
                  >
                    <span style={{
                      fontSize: '10px',
                      fontFamily: "'Segoe UI', system-ui, sans-serif",
                      color: constraints[key] ? '#d4a847' : 'rgba(212,168,71,0.2)',
                      marginTop: '1px',
                      flexShrink: 0,
                      letterSpacing: '0.05em',
                    }}>
                      {constraints[key] ? '◆' : '◇'}
                    </span>
                    <div>
                      <p style={{ fontSize: '11px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: constraints[key] ? '#d4a847' : 'rgba(245,240,232,0.35)', letterSpacing: '0.08em' }}>
                        {label}
                      </p>
                      <p style={{ fontSize: '11px', color: 'rgba(245,240,232,0.25)', lineHeight: 1.4, marginTop: '1px' }}>
                        {desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-6" style={{ paddingTop: '12px', borderTop: '1px solid rgba(212,168,71,0.08)' }}>
                <label className="flex items-center gap-2" style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.1em' }}>
                  Max iterations
                  <input
                    type="number" min={1} max={10}
                    value={constraints.max_iterations ?? 3}
                    onChange={e => setConstraints(prev => ({ ...prev, max_iterations: Math.max(1, Math.min(10, Number(e.target.value))) }))}
                    style={{ width: '36px', background: 'transparent', border: '1px solid rgba(212,168,71,0.2)', color: '#d4a847', textAlign: 'center', fontSize: '11px', outline: 'none', padding: '2px' }}
                  />
                </label>
                <label className="flex items-center gap-2" style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.1em' }}>
                  Quality target
                  <input
                    type="number" min={0} max={100}
                    value={constraints.quality_target ?? 75}
                    onChange={e => setConstraints(prev => ({ ...prev, quality_target: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                    style={{ width: '42px', background: 'transparent', border: '1px solid rgba(212,168,71,0.2)', color: '#d4a847', textAlign: 'center', fontSize: '11px', outline: 'none', padding: '2px' }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-between mb-2.5">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              style={{
                fontSize: '10px',
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                border: '1px solid rgba(212,168,71,0.15)',
                color: showAdvanced ? '#d4a847' : 'rgba(245,240,232,0.3)',
                background: showAdvanced ? 'rgba(212,168,71,0.05)' : 'transparent',
                padding: '4px 12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {showAdvanced ? '▴ Options' : '▾ Options'}
            </button>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', marginRight: '6px' }}>
                Audience
              </span>
              {AUDIENCES.map(a => (
                <button
                  key={a}
                  onClick={() => setAudience(a)}
                  style={{
                    fontSize: '10px',
                    fontFamily: "'Segoe UI', system-ui, sans-serif",
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '4px 14px',
                    border: `1px solid ${audience === a ? 'rgba(212,168,71,0.45)' : 'rgba(245,240,232,0.1)'}`,
                    color: audience === a ? 'rgba(212,168,71,0.8)' : 'rgba(245,240,232,0.25)',
                    background: audience === a ? 'rgba(212,168,71,0.05)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea row */}
          <div
            className="gold-input-row flex items-end gap-3"
            style={{ padding: '10px 0' }}
          >
            <span style={{ color: 'rgba(212,168,71,0.4)', fontSize: '14px', alignSelf: 'center', flexShrink: 0 }}>◆</span>
            <textarea
              ref={textareaRef}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'rgba(245,240,232,0.8)',
                fontSize: '14px',
                resize: 'none',
                fontFamily: 'Georgia, serif',
                lineHeight: 1.6,
                caretColor: '#d4a847',
                minHeight: '22px',
                maxHeight: '144px',
              }}
              placeholder="Continue your inquiry…"
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={state.isStreaming}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || state.isStreaming}
              style={{
                flexShrink: 0,
                fontSize: '10px',
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                border: '1px solid rgba(212,168,71,0.35)',
                color: '#d4a847',
                background: 'rgba(212,168,71,0.06)',
                padding: '8px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                opacity: (!input.trim() || state.isStreaming) ? 0.4 : 1,
              }}
            >
              {state.isStreaming ? (
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-accent typing-dot" />
                  <span className="w-1.5 h-1.5 bg-accent typing-dot" />
                  <span className="w-1.5 h-1.5 bg-accent typing-dot" />
                </span>
              ) : 'Submit ◆'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
