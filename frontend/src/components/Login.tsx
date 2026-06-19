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
      <div className="w-full max-w-md px-8 py-12 card flex flex-col items-center gap-8">
        {/* Logo / branding */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center">
            <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Research Assistant</h1>
            <p className="text-muted text-sm mt-1">Agentic · Self-RAG · Knowledge Monitor</p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {['arXiv search', 'Web search', 'GitHub search', 'Auto-monitor', 'Self-RAG', 'Streaming'].map(f => (
            <span key={f} className="text-xs bg-panel border border-border text-muted px-2.5 py-1 rounded-full">
              {f}
            </span>
          ))}
        </div>

        {/* Sign-in */}
        <div className="w-full flex flex-col items-center gap-3">
          <p className="text-muted text-sm">Sign in to start researching</p>
          {loading ? (
            <div className="flex gap-1.5 py-3">
              <span className="w-2 h-2 rounded-full bg-accent typing-dot" />
              <span className="w-2 h-2 rounded-full bg-accent typing-dot" />
              <span className="w-2 h-2 rounded-full bg-accent typing-dot" />
            </div>
          ) : (
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError('Google login failed')}
              theme="filled_black"
              size="large"
              text="signin_with"
              shape="rectangular"
              width="280"
            />
          )}
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
        </div>

        <p className="text-xs text-muted text-center">
          Your session is tied to this browser tab.
          <br />Closing the window will sign you out automatically.
        </p>
      </div>
    </div>
  )
}
