import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'

interface Props { onLogin: (credential: string) => Promise<void> }

const FEATURES = [
  {
    icon: '🔍',
    label: 'Validate Ideas',
    desc: 'Check novelty and discover related work before you build.',
  },
  {
    icon: '🛠',
    label: 'Find Tools',
    desc: 'Discover the best frameworks and libraries for any use case.',
  },
  {
    icon: '📖',
    label: 'Learn Concepts',
    desc: 'Deep-dive any technology from basics to expert level.',
  },
  {
    icon: '🔬',
    label: 'Deep Research',
    desc: 'Comprehensive reports with citations and expert analysis.',
  },
]

export default function Login({ onLogin }: Props) {
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSuccess(response: CredentialResponse) {
    if (!response.credential) return
    setLoading(true); setError(null)
    try { await onLogin(response.credential) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Login failed') }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--bg)',
      fontFamily: 'var(--font-ui)',
    }}>

      {/* ── Left panel — branding ── */}
      <div style={{
        flex: '1 1 55%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 64px',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>🔬</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              IntelLab
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
              AI Research Intelligence Suite
            </div>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 36, fontWeight: 700, color: 'var(--text)',
          letterSpacing: '-0.03em', lineHeight: 1.2,
          marginBottom: 14, maxWidth: 420,
        }}>
          Research smarter,<br />
          <span style={{ color: 'var(--orange-light)' }}>not harder.</span>
        </h1>
        <p style={{
          fontSize: 15, color: 'var(--text-3)', lineHeight: 1.65,
          marginBottom: 48, maxWidth: 380,
        }}>
          Multi-agent AI that validates ideas, discovers tools, explains
          concepts, and produces in-depth research reports — in seconds.
        </p>

        {/* Feature grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 12, maxWidth: 480,
        }}>
          {FEATURES.map(f => (
            <div key={f.label} style={{
              padding: '16px 18px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                {f.label}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — sign in ── */}
      <div style={{
        flex: '1 1 45%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 48px',
        background: 'var(--bg-2)',
      }}>

        <div style={{ width: '100%', maxWidth: 340 }}>

          {/* Heading */}
          <h2 style={{
            fontSize: 24, fontWeight: 700, color: 'var(--text)',
            letterSpacing: '-0.02em', marginBottom: 8,
          }}>
            Welcome back
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 36 }}>
            Sign in to your research workspace.
          </p>

          {/* Google button */}
          <div style={{
            padding: '24px 20px',
            background: 'var(--surface)',
            border: '1px solid var(--border-2)',
            borderRadius: 12,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 14,
          }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 0.2, 0.4].map((d, i) => (
                    <span key={i} className="typing-dot" style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--orange)', display: 'inline-block',
                      animationDelay: `${d}s`,
                    }} />
                  ))}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-4)' }}>Authenticating…</p>
              </div>
            ) : (
              <>
                <GoogleLogin
                  onSuccess={handleSuccess}
                  onError={() => setError('Google sign-in failed')}
                  theme="filled_black"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  width="280"
                />
                <p style={{ fontSize: 11, color: 'var(--text-5)', textAlign: 'center' }}>
                  Secure OAuth · your data stays private
                </p>
              </>
            )}
            {error && (
              <p style={{
                fontSize: 12, color: 'rgba(252,165,165,0.85)', textAlign: 'center',
                padding: '6px 10px', background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6,
                width: '100%',
              }}>{error}</p>
            )}
          </div>

          {/* Trust line */}
          <div style={{
            marginTop: 20,
            display: 'flex', alignItems: 'center', gap: 16,
            justifyContent: 'center',
          }}>
            {['End-to-end encrypted', 'No ads', 'Session only'].map(t => (
              <span key={t} style={{ fontSize: 11, color: 'var(--text-5)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#4ade80', fontSize: 9 }}>✓</span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
