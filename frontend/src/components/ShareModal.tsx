import { useState, useEffect } from 'react'
import { shareReport, revokeShare } from '../lib/api'

interface Props { threadId: string; onClose: () => void }

export default function ShareModal({ threadId, onClose }: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    shareReport(threadId)
      .then(({ url }) => { setShareUrl(url); setLoading(false) })
      .catch(err => { setError(err.message ?? 'Failed to create share link.'); setLoading(false) })
  }, [threadId])

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRevoke() {
    setRevoking(true)
    await revokeShare(threadId).catch(console.error)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width:'100%', maxWidth:400, margin:16,
        background:'var(--surface)', border:'1px solid var(--border-2)',
        borderRadius:12, padding:'22px 22px',
        boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
        fontFamily:'var(--font-ui)',
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>Share Report</div>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize:18 }}>×</button>
        </div>

        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'20px 0', gap:6 }}>
            {[0,.2,.4].map((d,i) => <span key={i} className="typing-dot" style={{ width:7,height:7,borderRadius:'50%',background:'var(--orange-dim)',display:'inline-block',animationDelay:`${d}s` }} />)}
          </div>
        ) : error ? (
          <p style={{ fontSize:13, color:'rgba(252,165,165,0.8)', textAlign:'center', padding:'14px 0' }}>{error}</p>
        ) : shareUrl ? (<>
          <p style={{ fontSize:12, color:'var(--text-4)', marginBottom:14, lineHeight:1.6 }}>
            Anyone with this link can view the report — no login required.
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14,
            background:'var(--surface-2)', borderRadius:'var(--radius-xs)', padding:'8px 11px',
            border:'1px solid var(--border)' }}>
            <span style={{ flex:1, fontSize:11, color:'var(--text-4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'var(--font-mono)' }}>
              {shareUrl}
            </span>
            <button onClick={copyLink} style={{
              flexShrink:0, fontSize:11, fontWeight:600,
              border:`1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'var(--border-2)'}`,
              color: copied ? '#4ade80' : 'var(--text-3)',
              background: copied ? 'rgba(74,222,128,0.07)' : 'var(--surface-3)',
              padding:'4px 11px', cursor:'pointer', transition:'all 0.15s', borderRadius:'var(--radius-xs)',
            }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={handleRevoke} disabled={revoking} style={{
            width:'100%', fontSize:12, fontWeight:500,
            border:'1px solid rgba(248,113,113,0.2)', color:'rgba(252,165,165,0.6)',
            background:'rgba(248,113,113,0.04)', padding:'9px', cursor:'pointer',
            transition:'all 0.15s', borderRadius:'var(--radius-xs)', opacity: revoking ? 0.4 : 1,
            fontFamily:'var(--font-ui)',
          }}>
            {revoking ? 'Revoking…' : 'Revoke Link'}
          </button>
        </>) : null}
      </div>
    </div>
  )
}
