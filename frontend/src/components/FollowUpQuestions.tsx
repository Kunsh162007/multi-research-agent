const ROMANS = ['I','II','III','IV','V','VI','VII','VIII','IX','X']

interface Props {
  questions: string[]
  onSelect: (q: string) => void
}

export default function FollowUpQuestions({ questions, onSelect }: Props) {
  if (!questions.length) return null
  return (
    <div className="mt-2">
      <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px' }}>
        Follow-up Inquiries
      </p>
      <div className="flex flex-col gap-1.5">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="text-left flex items-start gap-3 transition-all"
            style={{
              padding: '9px 14px',
              border: '1px solid rgba(212,168,71,0.1)',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(212,168,71,0.3)'; el.style.background = 'rgba(212,168,71,0.03)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(212,168,71,0.1)'; el.style.background = 'transparent' }}
          >
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '12px', color: 'rgba(212,168,71,0.4)', fontStyle: 'italic', flexShrink: 0, marginTop: '1px', minWidth: '18px' }}>
              {ROMANS[i] ?? String(i + 1)}
            </span>
            <span style={{ fontSize: '13px', color: 'rgba(245,240,232,0.5)', lineHeight: 1.5, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
              {q}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
