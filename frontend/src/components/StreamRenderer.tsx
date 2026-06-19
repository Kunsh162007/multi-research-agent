import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SSEEvent, Validation, Source, StepEvent } from '../types'

interface Props {
  events: SSEEvent[]
  report: string
  isStreaming: boolean
  quality: number
  iteration: number
  validation?: Validation
  sources?: Source[]
}

const NODE_LABELS: Record<string, string> = {
  enhance:          'Decomposing query',
  decide_retrieval: 'Deciding retrieval strategy',
  retrieve:         'Searching sources',
  grade_relevance:  'Grading relevance',
  generate:         'Drafting report',
  grade_answer:     'Quality check',
  reflect:          'Reflecting on gaps',
  synthesize:       'Synthesizing report',
  validate:         'Validating report',
  resume:           'Resuming from checkpoint',
}

function inferSourceType(url: string): string {
  if (url.includes('arxiv.org'))            return 'arXiv'
  if (url.includes('github.com'))           return 'GitHub'
  if (url.includes('wikipedia.org'))        return 'Wiki'
  if (url.includes('semanticscholar.org'))  return 'Scholar'
  if (url.includes('doi.org'))              return 'CrossRef'
  return 'Web'
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') }
  catch { return url }
}

export default function StreamRenderer({ events, report, isStreaming, quality, iteration, validation, sources = [] }: Props) {
  const steps = events.filter((e): e is StepEvent => e.type === 'step')
  const hasReport = report.length > 0
  const isResearching = isStreaming && !hasReport
  const isWriting   = isStreaming && hasReport

  return (
    <div className="stream-root">

      {/* Activity log — shown while researching, hidden once report starts */}
      {steps.length > 0 && !hasReport && (
        <div className="activity-log">
          <div className="activity-header">
            {isResearching && <span className="activity-spinner" />}
            <span className="activity-title">
              {isResearching ? 'Researching…' : 'Research complete'}
            </span>
            {iteration > 0 && <span className="activity-badge">Iteration {iteration}</span>}
          </div>
          <div className="activity-steps">
            {steps.map((step, i) => {
              const isLast  = i === steps.length - 1
              const isActive = isLast && isStreaming
              const detailSuffix = step.detail.includes('—')
                ? step.detail.split('—')[1]?.trim()
                : null
              return (
                <div key={i} className={`activity-step${isActive ? ' active' : ''}`}>
                  {isActive
                    ? <span className="step-spinner" />
                    : <span className="step-icon">✓</span>
                  }
                  <span className="step-name">{NODE_LABELS[step.node] ?? step.node}</span>
                  {detailSuffix && <span className="step-detail">{detailSuffix}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Source cards */}
      {sources.length > 0 && (
        <div className="sources-section">
          <div className="sources-header">
            <span className="sources-label">Sources</span>
            <span className="sources-count">{sources.length}</span>
          </div>
          <div className="sources-grid">
            {sources.slice(0, 8).map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="source-card"
              >
                <span className="source-type">{inferSourceType(src.url)}</span>
                <span className="source-title">
                  {(src.title || getDomain(src.url)).slice(0, 72)}
                </span>
                <span className="source-domain">{getDomain(src.url)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {hasReport && (
        <div className="report-section">
          <div className="report-meta-bar">
            <span className="report-label">Research Report</span>
            {!isStreaming && (
              <div className="report-badges">
                {iteration > 0 && (
                  <span className="badge">{iteration} iteration{iteration !== 1 ? 's' : ''}</span>
                )}
                {sources.length > 0 && (
                  <span className="badge">{sources.length} sources</span>
                )}
                {quality > 0 && (
                  <span className={`badge quality-badge ${quality >= 80 ? 'hi' : quality >= 60 ? 'mid' : 'lo'}`}>
                    {quality}% quality
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="report-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
            {isWriting && <span className="cursor-blink" />}
          </div>
        </div>
      )}

      {/* Validation */}
      {validation && !isStreaming && (
        <div className="validation-section">
          <div className="validation-scores">
            {(['accuracy', 'completeness', 'clarity', 'overall'] as const).map(key => {
              const val = validation[key]
              if (val == null) return null
              return (
                <div key={key} className={`score-item${key === 'overall' ? ' overall' : ''}`}>
                  <div className="score-value">
                    {val}<span className="score-max">/100</span>
                  </div>
                  <div className="score-label">{key}</div>
                </div>
              )
            })}
          </div>
          {validation.summary && (
            <p className="validation-summary">{validation.summary}</p>
          )}
        </div>
      )}
    </div>
  )
}
