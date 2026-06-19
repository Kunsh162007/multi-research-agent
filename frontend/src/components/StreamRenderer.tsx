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
  enhance:          'Query Decomposition',
  decide_retrieval: 'Retrieval Decision',
  retrieve:         'Source Retrieval',
  grade_relevance:  'Evidence Grading',
  generate:         'Report Generation',
  grade_answer:     'Quality Check',
  reflect:          'Reflexion',
  synthesize:       'Synthesis',
  validate:         'Validation',
  resume:           'Resume',
}

const ROMANS = ['I','II','III','IV','V','VI','VII','VIII','IX','X']

export default function StreamRenderer({ events, report, isStreaming, quality, iteration, validation }: Props) {
  const steps = events.filter(e => e.type === 'step')
  const hasReport = report.length > 0
  const isWriting = isStreaming && hasReport
  const isResearching = isStreaming && !hasReport

  return (
    <div className="flex flex-col gap-4">

      {/* Pipeline steps */}
      {(isResearching || (!isStreaming && steps.length > 0 && !hasReport)) && (
        <div style={{ padding: '20px 24px', background: 'rgba(212,168,71,0.03)', border: '1px solid rgba(212,168,71,0.1)' }}>
          <div className="flex items-center justify-between mb-4">
            <span style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Research Pipeline
            </span>
            {iteration > 0 && (
              <span style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.1em' }}>
                Iteration {iteration}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {steps.map((e, i) => {
              if (e.type !== 'step') return null
              const isLast = i === steps.length - 1
              const isDone = !isLast || !isStreaming
              const label = NODE_LABELS[e.node] ?? e.node
              const roman = ROMANS[i] ?? String(i + 1)
              return (
                <div
                  key={i}
                  className={`step-pill ${isDone ? 'done' : isLast ? 'active' : 'done'}`}
                >
                  <span className="step-pill-num">{roman}</span>
                  {label}
                  {isLast && isStreaming && <span className="cursor-blink" />}
                </div>
              )
            })}
          </div>

          {quality > 0 && (
            <div className="flex items-center gap-3 mt-4 pt-3" style={{ borderTop: '1px solid rgba(212,168,71,0.1)' }}>
              <span style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.1em' }}>Quality</span>
              <div style={{ flex: 1, height: '2px', background: 'rgba(212,168,71,0.1)', borderRadius: '1px', overflow: 'hidden' }}>
                <div style={{ width: `${quality}%`, height: '100%', background: '#d4a847', transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: '11px', fontFamily: 'Georgia, serif', color: '#d4a847', minWidth: '32px', textAlign: 'right' }}>
                {quality}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Report */}
      {hasReport && (
        <div className="flex flex-col gap-2">
          {/* Kicker */}
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
              ◆ &nbsp; Research Report
            </span>
            {isWriting && <span className="cursor-blink" />}
          </div>
          {/* Gold rule */}
          <div style={{ color: 'rgba(212,168,71,0.2)', fontSize: '11px', letterSpacing: '0.04em', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            ══════════════════════════════════════════════════════════════════════
          </div>
          <div className="report-body mt-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Validation scores */}
      {validation && !isStreaming && (
        <div style={{ marginTop: '8px', paddingTop: '20px', borderTop: '1px solid rgba(212,168,71,0.12)' }}>
          <div style={{ color: 'rgba(212,168,71,0.2)', fontSize: '11px', letterSpacing: '0.04em', overflow: 'hidden', whiteSpace: 'nowrap', marginBottom: '16px' }}>
            ══════════════════════ Validation Scores ══════════════════════
          </div>
          <div className="flex gap-8 flex-wrap">
            {([
              { label: 'Accuracy',     val: validation.accuracy,     highlight: false },
              { label: 'Completeness', val: validation.completeness, highlight: false },
              { label: 'Clarity',      val: validation.clarity,      highlight: false },
              { label: 'Overall',      val: validation.overall,      highlight: true  },
            ] as { label: string; val: number | undefined; highlight: boolean }[]).map(({ label, val, highlight }) => {
              if (val == null) return null
              return (
                <div key={label}>
                  <div style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: highlight ? '28px' : '24px',
                    color: highlight ? '#e8be60' : '#d4a847',
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {val}{' '}
                    <span style={{ fontSize: '13px', color: 'rgba(212,168,71,0.35)' }}>/ 100</span>
                  </div>
                  <div style={{
                    fontFamily: "'Segoe UI', system-ui, sans-serif",
                    fontSize: '9px',
                    color: highlight ? 'rgba(212,168,71,0.45)' : 'rgba(245,240,232,0.22)',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    marginTop: '5px',
                  }}>
                    {label}
                  </div>
                </div>
              )
            })}
          </div>
          {validation.summary && (
            <p style={{ marginTop: '14px', fontSize: '12px', color: 'rgba(245,240,232,0.3)', fontStyle: 'italic' }}>
              {validation.summary}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
