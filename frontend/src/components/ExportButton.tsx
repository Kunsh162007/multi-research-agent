import { useState } from 'react'
import { exportReport } from '../lib/api'

interface Props { threadId: string; report?: string }
type Format = 'md' | 'pdf' | 'docx' | 'bib'

const OPTIONS: { format: Format; label: string; ext: string; style?: 'paper' }[] = [
  { format: 'md',   label: 'Markdown',       ext: '.md'   },
  { format: 'pdf',  label: 'PDF',            ext: '.pdf'  },
  { format: 'pdf',  label: 'Research Paper', ext: '.pdf', style: 'paper' },
  { format: 'docx', label: 'Word',           ext: '.docx' },
  { format: 'bib',  label: 'BibTeX',         ext: '.bib'  },
]

export default function ExportButton({ threadId, report }: Props) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState<Format | null>(null)
  const [copied, setCopied]   = useState(false)

  async function handleExport(format: Format, style?: 'paper') {
    setLoading(format); setOpen(false)
    try { await exportReport(threadId, format, style) }
    catch (err) { console.error('Export failed', err) }
    finally { setLoading(null) }
  }

  async function handleCopy() {
    if (!report) return
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { }
  }

  return (
    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
      {report && (
        <button onClick={handleCopy} className="btn-ghost" style={{
          fontSize:12, border:'1px solid var(--border)', borderRadius:'var(--radius-xs)',
          padding:'4px 11px', color: copied ? '#4ade80' : 'var(--text-4)',
        }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      )}

      <div style={{ position:'relative' }}>
        <button onClick={() => setOpen(o => !o)} disabled={loading !== null} className="btn-ghost" style={{
          fontSize:12, border:'1px solid var(--border)', borderRadius:'var(--radius-xs)',
          padding:'4px 11px', opacity: loading ? 0.5 : 1,
        }}>
          {loading ? '…' : '↓ Export'}
        </button>

        {open && (<>
          <div style={{ position:'fixed', inset:0, zIndex:30 }} onClick={() => setOpen(false)} />
          <div style={{
            position:'absolute', bottom:'calc(100% + 4px)', left:0, zIndex:40, minWidth:130,
            background:'var(--surface-2)', border:'1px solid var(--border-2)',
            borderRadius:'var(--radius-sm)', overflow:'hidden',
            boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
          }}>
            {OPTIONS.map((o, i) => (
              <button key={o.label} onClick={() => handleExport(o.format, o.style)} style={{
                width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16,
                padding:'9px 13px', fontSize:12, color:'var(--text-3)',
                borderBottom: i < OPTIONS.length-1 ? '1px solid var(--border)' : 'none',
                background:'transparent', cursor:'pointer', transition:'background 0.12s, color 0.12s',
                fontFamily:'var(--font-ui)',
              }}
              onMouseEnter={e => { const el=e.currentTarget as HTMLElement; el.style.background='var(--surface-3)'; el.style.color='var(--text)' }}
              onMouseLeave={e => { const el=e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.color='var(--text-3)' }}>
                <span>{o.label}</span>
                <span style={{ color:'var(--text-5)', fontSize:10 }}>{o.ext}</span>
              </button>
            ))}
          </div>
        </>)}
      </div>
    </div>
  )
}
