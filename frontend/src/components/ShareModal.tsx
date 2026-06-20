import { useState, useEffect } from 'react'
import { shareReport, revokeShare } from '../lib/api'

interface Props { threadId: string; onClose: () => void }

export default function ShareModal({ threadId, onClose }: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '420px', margin: '16px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(79,195,247,0.25)', borderRadius: '16px', padding: '26px 26px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Top shine */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(79,195,247,0.5), transparent)' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: '#4fc3f7' }}>⇡</span>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: '0.04em' }}>Share Report</p>
          </div>
          <button onClick={onClose} style={{ fontSize: '16px', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', background: 'none', border: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)' }}
          >×</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0', gap: '6px' }}>
            {[0,0.2,0.4].map((d,i) => (
              <span key={i} className="typing-dot" style={{ width:8,height:8,borderRadius:'50%',background:'rgba(79,195,247,0.5)',display:'inline-block',animationDelay:`${d}s` }} />
            ))}
          </div>
        ) : error ? (
          <p style={{ fontSize: '13px', color: 'rgba(252,165,165,0.8)', textAlign: 'center', padding: '16px 0' }}>{error}</p>
        ) : shareUrl ? (
          <>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '16px', lineHeight: 1.6 }}>
              Anyone with this link can view the report — no login required.
            </p>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
              background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px 12px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ flex: 1, fontSize: '11px', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {shareUrl}
              </span>
              <button onClick={copyLink} style={{
                flexShrink: 0, fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase',
                border: `1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(79,195,247,0.3)'}`,
                color: copied ? '#4ade80' : '#7dd3fc',
                background: copied ? 'rgba(74,222,128,0.08)' : 'rgba(79,195,247,0.08)',
                padding: '4px 12px', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '6px',
              }}>
                {copied ? '✓ Copied' : '⎘ Copy'}
              </button>
            </div>

            <button onClick={handleRevoke} disabled={revoking} style={{
              width: '100%', fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase',
              border: '1px solid rgba(252,165,165,0.25)', color: 'rgba(252,165,165,0.55)',
              background: 'rgba(252,165,165,0.04)', padding: '10px', cursor: 'pointer',
              transition: 'all 0.2s', borderRadius: '8px', opacity: revoking ? 0.4 : 1,
            }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(252,165,165,0.45)'; el.style.color = 'rgba(252,165,165,0.85)' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(252,165,165,0.25)'; el.style.color = 'rgba(252,165,165,0.55)' }}
            >
              {revoking ? 'Revoking…' : 'Revoke Link'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
