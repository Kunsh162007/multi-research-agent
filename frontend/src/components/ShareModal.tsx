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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-panel border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
            <h3 className="font-semibold text-white">Share Report</h3>
          </div>
          <button onClick={onClose} className="p-1 text-muted hover:text-white transition-colors rounded-lg hover:bg-card">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-400 text-center py-4">{error}</p>
        ) : shareUrl ? (
          <>
            <p className="text-sm text-muted mb-3">Anyone with this link can view the report without logging in.</p>

            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5 mb-4">
              <span className="flex-1 text-xs text-white font-mono truncate">{shareUrl}</span>
              <button
                onClick={copyLink}
                className="shrink-0 text-xs px-3 py-1 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg transition-colors font-medium"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {views > 0 && (
              <p className="text-xs text-muted mb-4 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {views} view{views !== 1 ? 's' : ''}
              </p>
            )}

            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="w-full text-sm py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {revoking ? 'Revoking…' : 'Revoke link'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
