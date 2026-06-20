interface Props {
  questions: string[]
  onSelect: (q: string) => void
}

export default function FollowUpQuestions({ questions, onSelect }: Props) {
  if (!questions.length) return null
  return (
    <div style={{ marginTop: '10px' }}>
      <p style={{
        fontSize: '9px', fontWeight: '700', color: 'rgba(79,195,247,0.45)',
        letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px',
      }}>
        Dive Deeper
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxWidth: '720px' }}>
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            style={{
              textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '9px 14px',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', cursor: 'pointer', transition: 'all 0.18s',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.borderColor = 'rgba(79,195,247,0.3)'
              el.style.background = 'rgba(79,195,247,0.06)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.borderColor = 'rgba(255,255,255,0.08)'
              el.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)'
            }}
          >
            <span style={{
              fontSize: '11px', color: 'rgba(79,195,247,0.4)', flexShrink: 0,
              marginTop: '1px', minWidth: '16px', fontWeight: '700',
            }}>
              {i + 1}.
            </span>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
              {q}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
