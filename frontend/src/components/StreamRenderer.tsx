import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SSEEvent, Validation } from '../types'

interface Props {
  events: SSEEvent[]
  report: string
  isStreaming: boolean
  quality: number
  iteration: number
  validation?: Validation
}

const NODE_ICONS: Record<string, string> = {
  enhance:          '✦',
  decide_retrieval: '⊙',
  retrieve:         '⬇',
  grade_relevance:  '⊡',
  generate:         '◎',
  grade_answer:     '⊕',
  synthesize:       '◈',
  validate:         '✓',
  resume:           '↩',
}

export default function StreamRenderer({ events, report, isStreaming, quality, iteration, validation }: Props) {
  const steps = events.filter(e => e.type === 'step')
  const hasReport = report.length > 0
  const showProgress = isStreaming || (steps.length > 0 && !hasReport)

  return (
    <div className="flex flex-col gap-4">
      {/* Progress feed */}
      {showProgress && (
        <div className="flex flex-col gap-1.5 p-4 bg-panel border border-border rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Research progress</span>
            {iteration > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>Iteration {iteration}</span>
                {quality > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-500"
                        style={{ width: `${quality}%` }}
                      />
                    </div>
                    <span>{quality}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {steps.map((e, i) => {
            if (e.type !== 'step') return null
            const isLast = i === steps.length - 1
            return (
              <div key={i} className={`flex items-start gap-2 text-sm ${isLast && isStreaming ? 'text-white' : 'text-muted'}`}>
                <span className="font-mono text-accent shrink-0 w-4 text-center text-xs mt-0.5">
                  {NODE_ICONS[e.node] ?? '·'}
                </span>
                <span className={isLast && isStreaming ? '' : ''}>{e.detail}</span>
                {isLast && isStreaming && (
                  <span className="flex gap-0.5 mt-1 ml-1">
                    <span className="w-1 h-1 rounded-full bg-accent typing-dot" />
                    <span className="w-1 h-1 rounded-full bg-accent typing-dot" />
                    <span className="w-1 h-1 rounded-full bg-accent typing-dot" />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Streaming / final report */}
      {hasReport && (
        <div className="report-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}

      {/* Validation scores */}
      {validation && !isStreaming && (
        <div className="flex flex-wrap gap-3 p-3 bg-panel border border-border rounded-xl mt-2">
          {[
            { label: 'Accuracy',     val: validation.accuracy },
            { label: 'Completeness', val: validation.completeness },
            { label: 'Clarity',      val: validation.clarity },
            { label: 'Overall',      val: validation.overall },
          ].map(({ label, val }) => val != null && (
            <div key={label} className="flex items-center gap-2">
              <span className="text-xs text-muted">{label}</span>
              <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${(val ?? 0) >= 75 ? 'bg-green-500' : (val ?? 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${val}%` }}
                />
              </div>
              <span className="text-xs text-white font-mono">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
