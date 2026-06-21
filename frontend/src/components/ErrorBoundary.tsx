import { Component, ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 16,
        background: 'var(--bg, #0d0f14)', fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}>
        <div style={{ fontSize: 36, lineHeight: 1 }}>⚠</div>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text, #f1f1f4)', margin: 0 }}>
          Something went wrong
        </p>
        <p style={{
          fontSize: 12, color: 'var(--text-4, #55555f)', margin: 0,
          maxWidth: 480, textAlign: 'center', lineHeight: 1.6,
          fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word',
        }}>
          {this.state.error.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, padding: '9px 24px',
            background: 'var(--orange, #f97316)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
          }}
        >
          Reload app
        </button>
      </div>
    )
  }
}
