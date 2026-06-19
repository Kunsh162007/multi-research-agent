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
  ['use_adaptive', 'Adaptive',   'Auto-adjusts search depth by query complexity'],
  ['use_reflexion','Reflexion',  'Self-critiques & retries when quality is low'],
  ['use_hyde',     'HyDE',       'Generates a hypothetical answer to anchor searches'],
  ['use_rag_fusion','RAG Fusion','Runs multiple queries, merges via rank scoring'],
  ['use_storm',    'STORM',      'Expert personas each contribute unique angles'],
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

  // Load history when a thread is selected from sidebar
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

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, state.events, state.report])

  // Sync streaming state into the active message
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
            }
          : m,
      ),
    )
  }, [state.events, state.report, state.isStreaming, state.threadId, activeAssistantId])

  // Mark done, capture validation, refresh sidebar
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
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      {shareThreadId && (
        <ShareModal threadId={shareThreadId} onClose={() => setShareThreadId(null)} />
      )}

      {/* Header bar */}
      <div
        className="px-6 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,225,0.15)' }}
      >
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-accent">
            <span className="status-dot" />
            RSRCH.ENGINE.SESSION
          </div>
          <div className="text-xs font-mono text-dim-cyan mt-0.5">
            SELF-RAG ACTIVE · GROQ BACKEND
          </div>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
          <div className="text-center">
            <div
              className="text-4xl font-bold font-mono text-accent tracking-widest mb-1"
              style={{ textShadow: '0 0 20px #00ffe1, 0 0 40px rgba(0,255,225,0.5)' }}
            >
              RSRCH.AI
            </div>
            <div className="text-xs font-mono text-magenta tracking-widest mb-4">
              // INTELLIGENCE TERMINAL — READY
            </div>
            <div className="text-xs font-mono text-muted">
              <span className="text-magenta">$&gt;</span> initialize query to begin research...
              <span className="cursor-blink" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-center max-w-xl">
            {[
              'Latest advances in RLHF for LLMs',
              'Mamba vs Transformers architecture comparison',
              'State of multimodal AI in 2025',
              'RAG vs fine-tuning: when to use each',
            ].map(q => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="text-xs font-mono px-3 py-1.5 text-dim-cyan hover:text-accent transition-colors"
                style={{ border: '1px solid #0d2e2a' }}
              >
                &gt; {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {!isEmpty && (
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {messages.map(msg => (
            <div key={msg.id} className="flex flex-col gap-1">
              {msg.role === 'user' ? (
                <>
                  <div className="text-xs font-mono text-magenta tracking-wider">
                    [USR] · {fmtTime(msg.timestamp)}
                  </div>
                  <div
                    className="px-4 py-3 text-xs font-mono leading-relaxed"
                    style={{
                      border: '1px solid #ff2d78',
                      boxShadow: '0 0 12px rgba(255,45,120,0.2), inset 0 0 8px rgba(255,45,120,0.03)',
                      color: '#ff8ab0',
                      maxWidth: '560px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="text-xs font-mono tracking-wider"
                    style={{ color: '#00ffe1', textShadow: '0 0 6px rgba(0,255,225,0.4)' }}
                  >
                    [AI] rsrch.engine · {fmtTime(msg.timestamp)}
                  </div>
                  <div
                    className="p-4 bg-card"
                    style={{
                      border: '1px solid #00ffe1',
                      boxShadow: '0 0 20px rgba(0,255,225,0.1), inset 0 0 20px rgba(0,255,225,0.02)',
                    }}
                  >
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
                        <p style={{ color: '#4a7870', lineHeight: '1.7', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </p>
                      </div>
                    ) : null}

                    {/* Action bar */}
                    {msg.thread_id && !msg.isStreaming && (
                      <div
                        className="flex items-center gap-2 mt-3 pt-3 flex-wrap font-mono"
                        style={{ borderTop: '1px solid rgba(0,255,225,0.1)' }}
                      >
                        <ExportButton threadId={msg.thread_id} />
                        <button
                          onClick={() => setShareThreadId(msg.thread_id!)}
                          className="text-xs text-dim-cyan hover:text-accent transition-colors px-2 py-1"
                          style={{ border: '1px solid #0d2e2a' }}
                        >
                          [SHARE]
                        </button>
                        <span className="text-xs text-dim-cyan font-mono ml-auto">
                          thread_{msg.thread_id.slice(0, 8)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Follow-up questions */}
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
            <div
              className="px-4 py-3 text-xs font-mono"
              style={{ border: '1px solid #ff2d78', color: '#ff8ab0' }}
            >
              [ERR] {state.error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div
        className="px-6 py-4 bg-surface shrink-0"
        style={{ borderTop: '1px solid rgba(0,255,225,0.15)' }}
      >
        <div className="max-w-4xl mx-auto">
          {/* Advanced RAG options */}
          {showAdvanced && (
            <div
              className="mb-3 p-4 bg-card font-mono"
              style={{ border: '1px solid rgba(0,255,225,0.2)' }}
            >
              <p className="text-xs text-dim-cyan tracking-widest mb-3">// RAG_OPTIONS</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {RAG_TOGGLES.map(([key, label, desc]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleConstraint(key)}
                    className="flex items-start gap-2 text-left cursor-pointer group"
                  >
                    <span
                      className="text-xs shrink-0 mt-0.5 font-mono"
                      style={{
                        color: constraints[key] ? '#00ffe1' : '#1e4a44',
                        textShadow: constraints[key] ? '0 0 6px #00ffe1' : 'none',
                      }}
                    >
                      {constraints[key] ? '[ON]' : '[--]'}
                    </span>
                    <div>
                      <p className="text-xs font-mono" style={{ color: constraints[key] ? '#00ffe1' : '#4a6b67' }}>
                        {label.toUpperCase()}
                      </p>
                      <p className="text-xs text-dim-cyan leading-tight">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div
                className="flex items-center gap-4 pt-2"
                style={{ borderTop: '1px solid rgba(0,255,225,0.1)' }}
              >
                <label className="flex items-center gap-2 text-xs font-mono text-dim-cyan">
                  MAX_ITER:
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={constraints.max_iterations ?? 3}
                    onChange={e => setConstraints(prev => ({ ...prev, max_iterations: Math.max(1, Math.min(10, Number(e.target.value))) }))}
                    className="w-10 text-xs bg-transparent text-accent text-center focus:outline-none"
                    style={{ border: '1px solid #0d2e2a' }}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-mono text-dim-cyan">
                  QUALITY_TARGET:
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={constraints.quality_target ?? 75}
                    onChange={e => setConstraints(prev => ({ ...prev, quality_target: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                    className="w-12 text-xs bg-transparent text-accent text-center focus:outline-none"
                    style={{ border: '1px solid #0d2e2a' }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className={`text-xs font-mono px-2 py-1 transition-colors ${
                showAdvanced ? 'text-accent' : 'text-dim-cyan hover:text-accent'
              }`}
              style={{ border: '1px solid rgba(0,255,225,0.15)' }}
            >
              {showAdvanced ? '[ PARAMS ▴ ]' : '[ PARAMS ▾ ]'}
            </button>
            <div className="flex items-center gap-1 font-mono">
              <span className="text-xs text-dim-cyan mr-1">// MODE:</span>
              {AUDIENCES.map(a => (
                <button
                  key={a}
                  onClick={() => setAudience(a)}
                  className="text-xs px-2 py-0.5 transition-all font-mono"
                  style={{
                    border: `1px solid ${audience === a ? '#00ffe1' : '#0d2e2a'}`,
                    color: audience === a ? '#00ffe1' : '#4a6b67',
                    boxShadow: audience === a ? '0 0 8px rgba(0,255,225,0.3)' : 'none',
                  }}
                >
                  {a.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea + send */}
          <div
            className="flex items-end gap-3 px-4 py-3"
            style={{
              border: '1px solid #00ffe1',
              boxShadow: '0 0 12px rgba(0,255,225,0.1)',
            }}
          >
            <span className="text-magenta font-mono text-sm shrink-0 self-center">$&gt;</span>
            <textarea
              ref={textareaRef}
              className="flex-1 bg-transparent text-accent placeholder-dim-cyan text-xs resize-none focus:outline-none leading-relaxed min-h-[20px] max-h-36 font-mono"
              style={{ caretColor: '#00ffe1' }}
              placeholder="enter query..."
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={state.isStreaming}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || state.isStreaming}
              className="shrink-0 font-mono text-xs px-4 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: '1px solid #ff2d78',
                color: '#ff2d78',
                boxShadow: '0 0 8px rgba(255,45,120,0.3)',
              }}
            >
              {state.isStreaming ? (
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 bg-magenta typing-dot" />
                  <span className="w-1 h-1 bg-magenta typing-dot" />
                  <span className="w-1 h-1 bg-magenta typing-dot" />
                </span>
              ) : (
                'EXEC →'
              )}
            </button>
          </div>
          <p className="text-xs font-mono text-dim-cyan text-center mt-2">
            // SELF-RAG · LANGRAPH · GROQ_BACKEND
          </p>
        </div>
      </div>
    </div>
  )
}
