import { useState, useEffect } from 'react'
import { shareReport, revokeShare } from '../lib/api'

interface Props {
  threadId: string
  onClose: () => void
}

export default function ShareModal({ threadId, onClose }: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [views, setViews] = useState(0)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    shareReport(threadId)
      .then(({ url }) => {
        setShareUrl(url)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message ?? 'Failed to create share link.')
        setLoading(false)
      })
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-card p-6 w-full max-w-md font-mono"
        style={{ border: '1px solid #00ffe1', boxShadow: '0 0 40px rgba(0,255,225,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-accent tracking-widest">// SHARE_REPORT</span>
          <button
            onClick={onClose}
            className="text-xs text-dim-cyan hover:text-magenta transition-colors"
          >
            [×] CLOSE
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8 gap-1.5">
            <span className="w-2 h-2 bg-accent typing-dot" />
            <span className="w-2 h-2 bg-accent typing-dot" />
            <span className="w-2 h-2 bg-accent typing-dot" />
          </div>
        ) : error ? (
          <p className="text-xs text-magenta py-4 text-center">[ERR] {error}</p>
        ) : shareUrl ? (
          <>
            <p className="text-xs text-dim-cyan mb-3">
              &gt; anyone with this link can view the report without logging in.
            </p>

            <div
              className="flex items-center gap-2 px-3 py-2 mb-4"
              style={{ border: '1px solid rgba(0,255,225,0.25)' }}
            >
              <span className="flex-1 text-xs text-accent truncate">{shareUrl}</span>
              <button
                onClick={copyLink}
                className="shrink-0 text-xs px-2 py-1 transition-colors"
                style={{
                  border: `1px solid ${copied ? '#00ffe1' : '#0d2e2a'}`,
                  color: copied ? '#00ffe1' : '#4a6b67',
                }}
              >
                {copied ? '[COPIED!]' : '[COPY]'}
              </button>
            </div>

            {views > 0 && (
              <p className="text-xs text-dim-cyan mb-4">
                &gt; views: {views}
              </p>
            )}

            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="w-full text-xs py-2 transition-colors disabled:opacity-40"
              style={{ border: '1px solid rgba(255,45,120,0.4)', color: '#ff2d78' }}
            >
              {revoking ? 'REVOKING...' : '[REVOKE_LINK]'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
