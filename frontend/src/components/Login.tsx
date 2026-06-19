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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0c0c0c' }}>
      <div className="flex flex-col items-center gap-7 w-full max-w-sm px-6">

        {/* Logo */}
        <div className="text-center">
          <div style={{ color: '#d4a847', fontSize: '26px', letterSpacing: '0.12em', marginBottom: '10px' }}>
            ◆ RESEARCH AI
          </div>
          <div style={{
            height: '1px', width: '200px', margin: '0 auto 12px',
            background: 'linear-gradient(90deg, transparent, #d4a847, transparent)',
            opacity: 0.45,
          }} />
          <p style={{ fontSize: '11px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.5)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            Agentic Research Intelligence
          </p>
        </div>

        {/* Capabilities */}
        <div
          className="w-full"
          style={{ background: '#181612', border: '1px solid rgba(212,168,71,0.12)', padding: '20px 24px' }}
        >
          <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '14px' }}>
            Capabilities
          </p>
          {[
            'Self-RAG with adaptive retrieval',
            'arXiv · Web · Semantic Scholar · CrossRef',
            'Token-by-token report streaming',
            'Knowledge monitor & auto-sync',
            'Export Markdown / PDF / BibTeX',
          ].map(f => (
            <div key={f} className="flex items-start gap-3 mb-2.5">
              <span style={{ color: 'rgba(212,168,71,0.5)', fontSize: '10px', marginTop: '2px', flexShrink: 0 }}>◆</span>
              <span style={{ fontSize: '13px', color: 'rgba(245,240,232,0.55)', lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Sign-in card */}
        <div
          className="w-full flex flex-col items-center gap-4"
          style={{ background: '#181612', border: '1px solid rgba(212,168,71,0.2)', padding: '28px 24px' }}
        >
          <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Authenticate
          </p>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-accent typing-dot" />
                <span className="w-2 h-2 bg-accent typing-dot" />
                <span className="w-2 h-2 bg-accent typing-dot" />
              </div>
              <p style={{ fontSize: '11px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.5)', letterSpacing: '0.1em' }}>
                Authenticating…
              </p>
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
              <p style={{ fontSize: '11px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(245,240,232,0.2)', textAlign: 'center' }}>
                Sign in with Google to continue
              </p>
            </div>
          )}
          {error && (
            <p style={{ fontSize: '12px', color: 'rgba(200,80,60,0.8)', textAlign: 'center', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
              {error}
            </p>
          )}
        </div>

        <p style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(245,240,232,0.15)', textAlign: 'center', letterSpacing: '0.05em' }}>
          Session persists on refresh · closes on tab exit
        </p>
      </div>
    </div>
  )
}
