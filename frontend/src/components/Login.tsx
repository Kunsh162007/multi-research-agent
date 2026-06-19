import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'

interface Props {
  onLogin: (credential: string) => Promise<void>
}

export default function Login({ onLogin }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSuccess(response: CredentialResponse) {
    if (!response.credential) return
    setLoading(true)
    setError(null)
    try {
      await onLogin(response.credential)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm px-6">

        {/* Logo */}
        <div className="text-center">
          <div
            className="text-5xl font-bold font-mono text-accent tracking-widest mb-2"
            style={{ textShadow: '0 0 20px #00ffe1, 0 0 40px rgba(0,255,225,0.5)' }}
          >
            RSRCH.AI
          </div>
          <div className="text-xs font-mono text-magenta tracking-widest">
            // INTELLIGENCE TERMINAL v2.4
          </div>
          <div className="text-xs font-mono text-dim-cyan mt-1 tracking-wide">
            SELF-RAG · LANGRAPH · KNOWLEDGE MONITOR
          </div>
        </div>

        {/* Feature list */}
        <div
          className="w-full p-4 bg-card font-mono"
          style={{ border: '1px solid rgba(0,255,225,0.2)' }}
        >
          <p className="text-xs text-dim-cyan tracking-widest mb-3">// CAPABILITIES</p>
          {[
            'arXiv + Web + Semantic Scholar search',
            'Self-RAG with adaptive retrieval',
            'Token-by-token report streaming',
            'Knowledge monitor & auto-sync',
            'Export MD / PDF / BibTeX',
          ].map(f => (
            <div key={f} className="flex items-center gap-2 mb-1.5 text-xs">
              <span className="text-magenta">▶</span>
              <span className="text-muted">{f}</span>
            </div>
          ))}
        </div>

        {/* Sign-in */}
        <div
          className="w-full p-6 bg-card flex flex-col items-center gap-4"
          style={{ border: '1px solid rgba(0,255,225,0.25)', boxShadow: '0 0 30px rgba(0,255,225,0.08)' }}
        >
          <p className="text-xs font-mono text-dim-cyan tracking-widest">// AUTHENTICATE</p>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-accent typing-dot" />
                <span className="w-2 h-2 bg-accent typing-dot" />
                <span className="w-2 h-2 bg-accent typing-dot" />
              </div>
              <p className="text-xs font-mono text-dim-cyan">AUTHENTICATING...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 w-full">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={() => setError('Google login failed')}
                theme="filled_black"
                size="large"
                text="signin_with"
                shape="rectangular"
                width="280"
              />
              <p className="text-xs font-mono text-dim-cyan text-center">
                &gt; sign in with Google OAuth to continue
              </p>
            </div>
          )}
          {error && (
            <p className="text-xs font-mono text-magenta text-center">
              [ERR] {error}
            </p>
          )}
        </div>

        <p className="text-xs font-mono text-dim-cyan text-center">
          // session persists on refresh · closes on tab exit
        </p>
      </div>
    </div>
  )
}
