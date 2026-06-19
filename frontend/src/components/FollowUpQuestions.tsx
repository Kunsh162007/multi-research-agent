interface Props {
  questions: string[]
  onSelect: (q: string) => void
}

export default function FollowUpQuestions({ questions, onSelect }: Props) {
  if (!questions.length) return null
  return (
    <div className="mt-3">
      <p className="text-xs font-mono text-dim-cyan tracking-widest mb-2">// FOLLOW_UP_QUERIES</p>
      <div className="flex flex-col gap-1">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="text-left text-xs px-3 py-2 font-mono transition-all text-dim-cyan hover:text-accent"
            style={{ border: '1px solid rgba(0,255,225,0.1)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,255,225,0.3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,255,225,0.1)' }}
          >
            <span className="text-magenta mr-2">{String(i + 1).padStart(2, '0')}.</span>
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
