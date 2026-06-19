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

  return (
    <div className="flex flex-col h-full">
      {shareThreadId && (
        <ShareModal threadId={shareThreadId} onClose={() => setShareThreadId(null)} />
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <div className="w-16 h-16 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center">
            <svg className="w-9 h-9 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-1">What would you like to research?</h2>
            <p className="text-muted text-sm max-w-sm">
              I'll search arXiv, the web, and GitHub, then synthesize a cited report using Self-RAG.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center max-w-lg">
            {[
              'Latest advances in RLHF for LLMs',
              'Mamba vs Transformers architecture comparison',
              'State of multimodal AI in 2025',
              'RAG vs fine-tuning: when to use each',
            ].map(q => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="text-sm px-3 py-1.5 bg-panel border border-border rounded-lg text-muted hover:text-white hover:border-accent/50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {!isEmpty && (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="max-w-2xl bg-accent/20 border border-accent/30 rounded-2xl rounded-tr-sm px-4 py-3">
                  <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                <div className="max-w-3xl w-full">
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
                      <p className="text-slate-300 leading-relaxed whitespace-pre-wrap text-sm">{msg.content}</p>
                    </div>
                  ) : null}

                  {/* Action bar */}
                  {msg.thread_id && !msg.isStreaming && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <ExportButton threadId={msg.thread_id} />
                      <button
                        onClick={() => setShareThreadId(msg.thread_id!)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 text-muted hover:text-white border border-border hover:border-accent/50 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                        </svg>
                        Share
                      </button>
                      <span className="text-xs text-muted font-mono ml-auto">thread: {msg.thread_id}</span>
                    </div>
                  )}

                  {/* Follow-up questions */}
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
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
              {state.error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-border bg-panel/50">
        <div className="max-w-4xl mx-auto">
          {/* Advanced RAG options */}
          {showAdvanced && (
            <div className="mb-3 p-3 bg-card border border-border rounded-xl">
              <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">RAG Options</p>
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                {RAG_TOGGLES.map(([key, label, desc]) => (
                  <label key={key} className="flex items-start gap-2 cursor-pointer group select-none">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!constraints[key]}
                      onClick={() => toggleConstraint(key)}
                      className={`w-8 h-4 rounded-full transition-colors relative shrink-0 mt-0.5 ${
                        constraints[key] ? 'bg-accent' : 'bg-border'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                        constraints[key] ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                    <div>
                      <p className="text-xs font-medium text-white leading-tight">{label}</p>
                      <p className="text-xs text-muted leading-tight">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-4 pt-2.5 border-t border-border">
                <label className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">Max iterations:</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={constraints.max_iterations ?? 3}
                    onChange={e => setConstraints(prev => ({ ...prev, max_iterations: Math.max(1, Math.min(10, Number(e.target.value))) }))}
                    className="w-12 text-xs bg-panel border border-border rounded px-1.5 py-0.5 text-white focus:outline-none focus:border-accent/60 text-center"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">Quality target:</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={constraints.quality_target ?? 75}
                    onChange={e => setConstraints(prev => ({ ...prev, quality_target: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                    className="w-14 text-xs bg-panel border border-border rounded px-1.5 py-0.5 text-white focus:outline-none focus:border-accent/60 text-center"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${
                showAdvanced ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Advanced
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Audience:</span>
              {AUDIENCES.map(a => (
                <button
                  key={a}
                  onClick={() => setAudience(a)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    audience === a ? 'bg-accent text-white' : 'text-muted hover:text-white'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea + send */}
          <div className="flex items-end gap-3 bg-card border border-border rounded-2xl px-4 py-3 focus-within:border-accent/60 transition-colors">
            <textarea
              ref={textareaRef}
              className="flex-1 bg-transparent text-white placeholder-muted text-sm resize-none focus:outline-none leading-relaxed min-h-[24px] max-h-40"
              placeholder="Ask anything to research… (Enter to send, Shift+Enter for newline)"
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={state.isStreaming}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!input.trim() || state.isStreaming}
              className="shrink-0 w-9 h-9 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {state.isStreaming ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-muted text-center mt-2">
            Powered by Claude claude-sonnet-4-6 · Self-RAG · LangGraph
          </p>
        </div>
      </div>
    </div>
  )
}
