import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'

interface Props { onLogin: (credential: string) => Promise<void> }

const MODES = [
  { icon: '⟳', label: 'Validate Ideas', desc: 'Check if your idea is novel & find related work', color: '#06b6d4' },
  { icon: '◈', label: 'Find Tools',     desc: 'Discover the best frameworks for any use case',  color: '#818cf8' },
  { icon: '◇', label: 'Learn Concepts', desc: 'Deep-dive any technology from basics to expert', color: '#34d399' },
  { icon: '◆', label: 'Deep Research',  desc: 'Comprehensive reports with citations & analysis', color: '#4fc3f7' },
]

export default function Login({ onLogin }: Props) {
  const [error, setError] = useState<string | null>(null)
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
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', background: 'transparent',
    }}>
      <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: '16px', marginBottom: '16px',
            background: 'linear-gradient(135deg, rgba(79,195,247,0.3), rgba(6,182,212,0.2))',
            border: '1px solid rgba(79,195,247,0.4)',
            fontSize: '24px', boxShadow: '0 0 32px rgba(79,195,247,0.25)',
          }}>◆</div>
          <h1 style={{
            fontSize: '22px', fontWeight: '800', letterSpacing: '-0.01em', marginBottom: '6px',
            background: 'linear-gradient(135deg, #7dd3fc 0%, #06b6d4 50%, #818cf8 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>IntelLab</h1>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            AI Research Intelligence
          </p>
        </div>

        {/* Mode showcase — replaces old Capabilities list */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
        }}>
          {MODES.map(m => (
            <div key={m.label} style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.18)', borderRadius: '12px',
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: `linear-gradient(90deg, transparent, ${m.color}40, transparent)`,
              }} />
              <div style={{ fontSize: '18px', marginBottom: '8px', color: m.color }}>{m.icon}</div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginBottom: '4px' }}>{m.label}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.58)', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          ))}
        </div>

        {/* Sign-in card */}
        <div style={{
          padding: '28px 24px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(79,195,247,0.2)', borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(79,195,247,0.4), transparent)',
          }} />
          <p style={{ fontSize: '9px', fontWeight: '700', color: 'rgba(79,195,247,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Sign In to Continue
          </p>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[0,0.2,0.4].map((d,i) => (
                  <span key={i} className="typing-dot" style={{ width:8,height:8,borderRadius:'50%',background:'#4fc3f7',display:'inline-block',animationDelay:`${d}s` }} />
                ))}
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(79,195,247,0.5)', letterSpacing: '0.1em' }}>Authenticating…</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={() => setError('Google login failed')}
                theme="filled_black"
                size="large"
                text="signin_with"
                shape="rectangular"
                width="280"
              />
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                Secure sign-in · your data stays private
              </p>
            </div>
          )}
          {error && (
            <p style={{ fontSize: '12px', color: 'rgba(252,165,165,0.8)', textAlign: 'center' }}>{error}</p>
          )}
        </div>

        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)', textAlign: 'center', letterSpacing: '0.05em' }}>
          Session persists on refresh · closes on tab exit
        </p>
      </div>
    </div>
  )
}
