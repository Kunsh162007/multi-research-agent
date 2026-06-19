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

const NODE_LABELS: Record<string, string> = {
  enhance:          'QUERY_ENHANCE',
  decide_retrieval: 'DECIDE_RETRIEVAL',
  retrieve:         'SRC_RETRIEVAL',
  grade_relevance:  'GRADE_RELEVANCE',
  generate:         'RPT_GENERATION',
  grade_answer:     'GRADE_ANSWER',
  reflect:          'REFLEXION',
  synthesize:       'SYNTHESIZE',
  validate:         'VALIDATION',
  resume:           'RESUME',
}

function asciiBar(val: number, total = 10): { filled: string; empty: string } {
  const f = Math.round((val / 100) * total)
  return { filled: '█'.repeat(f), empty: '░'.repeat(total - f) }
}

function padLabel(s: string, width = 20): string {
  if (s.length >= width) return s
  return s + ' ' + '.'.repeat(width - s.length - 1)
}

export default function StreamRenderer({ events, report, isStreaming, quality, iteration, validation }: Props) {
  const steps = events.filter(e => e.type === 'step')
  const hasReport = report.length > 0
  const isWriting = isStreaming && hasReport
  const isResearching = isStreaming && !hasReport

  return (
    <div className="flex flex-col gap-3">

      {/* Pipeline status — while graph is running */}
      {(isResearching || (!isStreaming && steps.length > 0 && !hasReport)) && (
        <div className="p-4 bg-card" style={{ border: '1px solid rgba(0,255,225,0.25)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-dim-cyan tracking-widest">// PIPELINE_STATUS</span>
            {iteration > 0 && (
              <span className="text-xs font-mono text-dim-cyan">ITER_{iteration}</span>
            )}
          </div>

          {steps.map((e, i) => {
            if (e.type !== 'step') return null
            const isLast = i === steps.length - 1
            const label = NODE_LABELS[e.node] ?? e.node.toUpperCase()
            const isDone = !isLast || !isStreaming
            return (
              <div key={i} className="flex items-center gap-2 mb-1.5 font-mono text-xs">
                <div
                  className="w-16 h-1.5 shrink-0"
                  style={{ background: '#0a1a18', border: '1px solid #1a3d38' }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: isDone ? '100%' : isLast ? '65%' : '100%',
                      background: isDone
                        ? '#00ffe1'
                        : 'linear-gradient(90deg, #00ffe1, transparent)',
                      boxShadow: isDone ? '0 0 4px #00ffe1' : 'none',
                      transition: 'width 0.4s',
                    }}
                  />
                </div>
                <span
                  className={isDone ? 'text-accent' : 'text-muted'}
                  style={isDone ? { textShadow: '0 0 6px rgba(0,255,225,0.4)' } : {}}
                >
                  {padLabel(label)} {isDone ? '[DONE]' : '[RUNNING]'}
                </span>
                {isLast && isStreaming && <span className="cursor-blink" />}
              </div>
            )
          })}

          {quality > 0 && (
            <div className="mt-3 pt-2 border-t border-border flex items-center gap-2 font-mono text-xs">
              <span className="text-dim-cyan">QUALITY</span>
              <span className="text-accent">{asciiBar(quality).filled}</span>
              <span className="text-border">{asciiBar(quality).empty}</span>
              <span className="text-accent">{quality}%</span>
            </div>
          )}
        </div>
      )}

      {/* Token-by-token report streaming */}
      {hasReport && (
        <div className="flex flex-col gap-2">
          {isWriting && (
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-accent tracking-widest">// RPT_GENERATION</span>
              <span className="cursor-blink" />
            </div>
          )}
          <div className="report-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
            {isWriting && <span className="cursor-blink" />}
          </div>
        </div>
      )}

      {/* Validation scores */}
      {validation && !isStreaming && (
        <div className="p-4 mt-1 bg-card font-mono" style={{ borderTop: '1px solid rgba(0,255,225,0.1)' }}>
          <span className="text-xs text-dim-cyan tracking-widest block mb-3">// VALIDATION_SCORES</span>
          {[
            { label: 'ACCURACY',     val: validation.accuracy },
            { label: 'COMPLETENESS', val: validation.completeness },
            { label: 'CLARITY',      val: validation.clarity },
            { label: 'OVERALL',      val: validation.overall },
          ].map(({ label, val }) => {
            if (val == null) return null
            const { filled, empty } = asciiBar(val)
            const isOverall = label === 'OVERALL'
            return (
              <div key={label} className="flex items-center gap-2 mb-2 text-xs">
                <span className="text-dim-cyan w-24 shrink-0">{label}</span>
                <span
                  className="text-accent"
                  style={isOverall ? { textShadow: '0 0 6px #00ffe1' } : {}}
                >
                  {filled}
                </span>
                <span className="text-border">{empty}</span>
                <span
                  className="text-accent ml-1"
                  style={isOverall ? { textShadow: '0 0 6px #00ffe1', fontWeight: 'bold' } : {}}
                >
                  {val}%
                </span>
              </div>
            )
          })}
          {validation.summary && (
            <p className="text-xs text-dim-cyan mt-2 pt-2 border-t border-border italic">
              &gt; {validation.summary}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
