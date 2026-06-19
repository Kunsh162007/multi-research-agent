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
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 text-muted hover:text-white border border-border hover:border-accent/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        )}
        {loading ? `Exporting ${loading.toUpperCase()}…` : 'Export'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1.5 left-0 z-40 bg-panel border border-border rounded-xl shadow-2xl overflow-hidden min-w-[148px]">
            {OPTIONS.map(o => (
              <button
                key={o.format}
                onClick={() => handleExport(o.format)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-muted hover:text-white hover:bg-card transition-colors text-left"
              >
                <span>{o.label}</span>
                <span className="text-xs text-muted/60 font-mono">{o.ext}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
