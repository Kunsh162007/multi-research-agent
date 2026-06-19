import { useState } from 'react'
import { exportReport } from '../lib/api'

interface Props { threadId: string }
type Format = 'md' | 'pdf' | 'bib'

const OPTIONS: { format: Format; label: string; ext: string }[] = [
  { format: 'md',  label: 'Markdown', ext: '.md'  },
  { format: 'pdf', label: 'PDF',      ext: '.pdf' },
  { format: 'bib', label: 'BibTeX',   ext: '.bib' },
]

export default function ExportButton({ threadId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<Format | null>(null)

  async function handleExport(format: Format) {
    setLoading(format); setOpen(false)
    try { await exportReport(threadId, format) }
    catch (err) { console.error('Export failed', err) }
    finally { setLoading(null) }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading !== null}
        style={{
          fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif",
          letterSpacing: '0.1em', textTransform: 'uppercase',
          border: '1px solid rgba(212,168,71,0.2)',
          color: 'rgba(212,168,71,0.5)', background: 'transparent',
          padding: '4px 12px', cursor: 'pointer', transition: 'all 0.2s',
          opacity: loading ? 0.4 : 1,
        }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#d4a847'; el.style.borderColor = 'rgba(212,168,71,0.5)' }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(212,168,71,0.5)'; el.style.borderColor = 'rgba(212,168,71,0.2)' }}
      >
        {loading ? (
          <span className="flex gap-0.5 items-center">
            <span className="w-1 h-1 bg-accent typing-dot" />
            <span className="w-1 h-1 bg-accent typing-dot" />
            <span className="w-1 h-1 bg-accent typing-dot" />
          </span>
        ) : 'Export'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full mb-1 left-0 z-40 min-w-[140px] overflow-hidden"
            style={{ background: '#181612', border: '1px solid rgba(212,168,71,0.25)' }}
          >
            {OPTIONS.map(o => (
              <button
                key={o.format}
                onClick={() => handleExport(o.format)}
                className="w-full flex items-center justify-between gap-4 text-left transition-all"
                style={{
                  padding: '9px 14px',
                  fontSize: '11px', fontFamily: "'Segoe UI', system-ui, sans-serif",
                  letterSpacing: '0.08em',
                  color: 'rgba(245,240,232,0.45)',
                  borderBottom: '1px solid rgba(212,168,71,0.08)',
                  background: 'transparent', cursor: 'pointer',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(245,240,232,0.8)'; el.style.background = 'rgba(212,168,71,0.04)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(245,240,232,0.45)'; el.style.background = 'transparent' }}
              >
                <span>{o.label}</span>
                <span style={{ color: 'rgba(212,168,71,0.45)', fontFamily: 'Georgia, serif', fontSize: '11px' }}>{o.ext}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
