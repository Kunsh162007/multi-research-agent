import { useState, useEffect } from 'react'
import { shareReport, revokeShare } from '../lib/api'

interface Props {
  threadId: string
  onClose: () => void
}

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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#181612', border: '1px solid rgba(212,168,71,0.25)', padding: '28px 28px', width: '100%', maxWidth: '420px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            ◆ &nbsp; Share Report
          </p>
          <button
            onClick={onClose}
            style={{ fontSize: '14px', color: 'rgba(245,240,232,0.25)', cursor: 'pointer', background: 'none', border: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.6)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.25)' }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8 gap-1.5">
            <span className="w-2 h-2 bg-accent typing-dot" />
            <span className="w-2 h-2 bg-accent typing-dot" />
            <span className="w-2 h-2 bg-accent typing-dot" />
          </div>
        ) : error ? (
          <p style={{ fontSize: '13px', color: 'rgba(200,80,60,0.7)', textAlign: 'center', padding: '16px 0' }}>{error}</p>
        ) : shareUrl ? (
          <>
            <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.3)', marginBottom: '14px', lineHeight: 1.6, fontStyle: 'italic' }}>
              Anyone with this link can view the report without logging in.
            </p>

            <div
              className="flex items-center gap-2 mb-5"
              style={{ borderBottom: '1px solid rgba(212,168,71,0.2)', padding: '8px 0' }}
            >
              <span style={{ flex: 1, fontSize: '12px', color: 'rgba(245,240,232,0.55)', fontFamily: 'Georgia, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shareUrl}
              </span>
              <button
                onClick={copyLink}
                style={{
                  flexShrink: 0, fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif",
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  border: `1px solid ${copied ? 'rgba(212,168,71,0.5)' : 'rgba(212,168,71,0.2)'}`,
                  color: copied ? '#d4a847' : 'rgba(212,168,71,0.45)',
                  background: copied ? 'rgba(212,168,71,0.06)' : 'transparent',
                  padding: '4px 12px', cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {copied ? 'Copied ◆' : 'Copy'}
              </button>
            </div>

            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="w-full"
              style={{
                fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif",
                letterSpacing: '0.1em', textTransform: 'uppercase',
                border: '1px solid rgba(200,80,60,0.3)',
                color: 'rgba(200,80,60,0.6)', background: 'transparent',
                padding: '10px', cursor: 'pointer', transition: 'all 0.2s',
                opacity: revoking ? 0.4 : 1,
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(200,80,60,0.5)'; el.style.color = 'rgba(200,80,60,0.9)' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(200,80,60,0.3)'; el.style.color = 'rgba(200,80,60,0.6)' }}
            >
              {revoking ? 'Revoking…' : 'Revoke Link'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
