import { useState } from 'react'
import { exportReport } from '../lib/api'

interface Props {
  threadId: string
}

type Format = 'md' | 'pdf' | 'bib'

const OPTIONS: { format: Format; label: string; ext: string }[] = [
  { format: 'md', label: 'Markdown', ext: '.md' },
  { format: 'pdf', label: 'PDF', ext: '.pdf' },
  { format: 'bib', label: 'BibTeX', ext: '.bib' },
]

export default function ExportButton({ threadId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<Format | null>(null)

  async function handleExport(format: Format) {
    setLoading(format)
    setOpen(false)
    try {
      await exportReport(threadId, format)
    } catch (err) {
      console.error('Export failed', err)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading !== null}
        className="text-xs px-2 py-1 font-mono text-dim-cyan hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ border: '1px solid #0d2e2a' }}
      >
        {loading ? (
          <span className="flex gap-0.5 items-center">
            <span className="w-1 h-1 bg-accent typing-dot" />
            <span className="w-1 h-1 bg-accent typing-dot" />
            <span className="w-1 h-1 bg-accent typing-dot" />
          </span>
        ) : '[EXPORT]'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full mb-1 left-0 z-40 bg-card overflow-hidden min-w-[140px]"
            style={{ border: '1px solid rgba(0,255,225,0.3)', boxShadow: '0 0 20px rgba(0,255,225,0.1)' }}
          >
            {OPTIONS.map(o => (
              <button
                key={o.format}
                onClick={() => handleExport(o.format)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs font-mono text-dim-cyan hover:text-accent transition-colors text-left"
                style={{ borderBottom: '1px solid rgba(0,255,225,0.1)' }}
              >
                <span>{o.label.toUpperCase()}</span>
                <span className="text-magenta">{o.ext}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
