interface Props {
  questions: string[]
  onSelect: (q: string) => void
}

export default function FollowUpQuestions({ questions, onSelect }: Props) {
  if (!questions.length) return null
  return (
    <div className="mt-4">
      <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2">Follow-up questions</p>
      <div className="flex flex-col gap-1.5">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="text-left text-sm px-3 py-2 bg-panel border border-border rounded-lg hover:border-accent/60 hover:bg-accent/5 text-muted hover:text-white transition-all group"
          >
            <span className="text-accent mr-1.5 font-mono text-xs">{i + 1}.</span>
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
