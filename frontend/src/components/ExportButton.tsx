import { useState } from 'react'
import { exportReport } from '../lib/api'

interface Props { threadId: string; report?: string }
type Format = 'md' | 'pdf' | 'bib'

const OPTIONS: { format: Format; label: string; ext: string }[] = [
  { format: 'md',  label: 'Markdown', ext: '.md'  },
  { format: 'pdf', label: 'PDF',      ext: '.pdf' },
  { format: 'bib', label: 'BibTeX',   ext: '.bib' },
]

const btn = {
  fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' as const,
  border: '1px solid rgba(79,195,247,0.22)', color: 'rgba(79,195,247,0.55)',
  background: 'rgba(79,195,247,0.05)', padding: '5px 12px',
  cursor: 'pointer', transition: 'all 0.18s', borderRadius: '6px',
  backdropFilter: 'blur(8px)',
}

export default function ExportButton({ threadId, report }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<Format | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleExport(format: Format) {
    setLoading(format); setOpen(false)
    try { await exportReport(threadId, format) }
    catch (err) { console.error('Export failed', err) }
    finally { setLoading(null) }
  }

  async function handleCopy() {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { }
  }

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {/* Copy button */}
      {report && (
        <button
          onClick={handleCopy}
          style={{
            ...btn,
            borderColor: copied ? 'rgba(74,222,128,0.4)' : 'rgba(79,195,247,0.22)',
            color: copied ? '#4ade80' : 'rgba(79,195,247,0.55)',
            background: copied ? 'rgba(74,222,128,0.07)' : 'rgba(79,195,247,0.05)',
          }}
          onMouseEnter={e => { if (!copied) { (e.currentTarget as HTMLElement).style.color = '#7dd3fc'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(79,195,247,0.45)' } }}
          onMouseLeave={e => { if (!copied) { (e.currentTarget as HTMLElement).style.color = 'rgba(79,195,247,0.55)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(79,195,247,0.22)' } }}
        >
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      )}

      {/* Export dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          disabled={loading !== null}
          style={{ ...btn, opacity: loading ? 0.5 : 1 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#7dd3fc'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(79,195,247,0.45)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(79,195,247,0.55)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(79,195,247,0.22)' }}
        >
          {loading ? '…' : '↓ Export'}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div
              className="absolute bottom-full mb-1 left-0 z-40 min-w-[130px] overflow-hidden"
              style={{
                background: 'rgba(8,16,48,0.95)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(79,195,247,0.2)', borderRadius: '10px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              {OPTIONS.map((o, i) => (
                <button
                  key={o.format}
                  onClick={() => handleExport(o.format)}
                  className="w-full flex items-center justify-between gap-4 text-left"
                  style={{
                    padding: '9px 14px', fontSize: '11px', fontWeight: '500',
                    letterSpacing: '0.06em', color: 'rgba(255,255,255,0.5)',
                    borderBottom: i < OPTIONS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    background: 'transparent', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#7dd3fc'; el.style.background = 'rgba(79,195,247,0.06)' }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(255,255,255,0.5)'; el.style.background = 'transparent' }}
                >
                  <span>{o.label}</span>
                  <span style={{ color: 'rgba(79,195,247,0.4)', fontSize: '10px' }}>{o.ext}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
