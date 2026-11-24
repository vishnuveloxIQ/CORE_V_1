import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[VeloxIQ] render error', error, info.componentStack) }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="card" style={{ margin: '40px auto', maxWidth: 520, padding: 28, textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 8px' }}>Something went wrong on this screen</h2>
        <p style={{ color: 'var(--muted)', margin: '0 0 18px' }}>The rest of the workspace is fine. Reload this page, or go back to the dashboard.</p>
        <p style={{ color: 'var(--muted)', margin: '0 0 18px', fontSize: 13 }}>Detail for support: {this.state.error.message || 'unknown error'}</p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          <button className="btn" type="button" onClick={() => location.reload()}>Reload</button>
          <button className="btn primary" type="button" onClick={() => { this.setState({ error: null }); location.hash = '#/' }}>Go to start</button>
        </div>
      </div>
    )
  }
}
