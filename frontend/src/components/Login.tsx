import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'

interface Props { onLogin: (credential: string) => Promise<void> }

const MODES = [
  { icon: '⟳', label: 'Validate Ideas',  desc: 'Check if your idea is novel & find related work',     color: '#fb923c' },
  { icon: '⬡', label: 'Find Tools',      desc: 'Discover the best frameworks for any use case',        color: '#f59e0b' },
  { icon: '◇', label: 'Learn Concepts',  desc: 'Deep-dive any technology from basics to expert',       color: '#fb923c' },
  { icon: '✦', label: 'Deep Research',   desc: 'Comprehensive reports with citations & analysis',      color: '#f59e0b' },
]

export default function Login({ onLogin }: Props) {
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSuccess(response: CredentialResponse) {
    if (!response.credential) return
    setLoading(true); setError(null)
    try { await onLogin(response.credential) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Login failed') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 16, marginBottom: 18,
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            fontSize: 26,
            boxShadow: '0 0 32px rgba(249,115,22,0.50)',
          }}>🔬</div>
          <h1 style={{
            fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6,
            color: '#e2e4f0',
          }}>IntelLab</h1>
          <p style={{ fontSize: 11, color: '#f97316', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            AI Research Intelligence Suite
          </p>
        </div>

        {/* Mode showcase */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {MODES.map(m => (
            <div key={m.label} style={{
              padding: '14px 16px',
              background: 'rgba(249,115,22,0.07)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(249,115,22,0.22)',
              borderRadius: 12,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                background: `linear-gradient(90deg, transparent, ${m.color}50, transparent)`,
              }} />
              <div style={{ fontSize: 18, marginBottom: 8, color: m.color }}>{m.icon}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#e2e4f0', marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          ))}
        </div>

        {/* Sign-in card */}
        <div style={{
          padding: '26px 24px',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(249,115,22,0.25)',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.45), transparent)',
          }} />
          <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(249,115,22,0.65)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Sign In to Continue
          </p>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} className="typing-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', display: 'inline-block', animationDelay: `${d}s` }} />
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'rgba(249,115,22,0.6)', letterSpacing: '0.1em' }}>Authenticating…</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={() => setError('Google login failed')}
                theme="filled_black"
                size="large"
                text="signin_with"
                shape="rectangular"
                width="280"
              />
              <p style={{ fontSize: 11, color: '#334155', textAlign: 'center' }}>
                Secure sign-in · your data stays private
              </p>
            </div>
          )}
          {error && <p style={{ fontSize: 12, color: 'rgba(252,165,165,0.8)', textAlign: 'center' }}>{error}</p>}
        </div>

        <p style={{ fontSize: 10, color: '#1e293b', textAlign: 'center', letterSpacing: '0.05em' }}>
          Session persists on refresh · closes on tab exit
        </p>
      </div>
    </div>
  )
}
