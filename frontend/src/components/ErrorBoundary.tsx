import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error) {
    return { error, info: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught', error, info)
    this.setState({ error, info })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="card border-verily-warm/60 bg-verily-warm/5 p-5">
          <h2 className="mb-2 text-base font-semibold text-verily-warm">
            Render error
          </h2>
          <div className="mb-3 font-mono text-sm text-verily-ink">
            {this.state.error.name}: {this.state.error.message}
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-verily-ink/60">
              Stack
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-verily-paper p-3 text-[11px] leading-tight text-verily-ink/70">
              {this.state.error.stack}
              {this.state.info?.componentStack}
            </pre>
          </details>
          <button
            className="btn-ghost mt-3"
            onClick={() => this.setState({ error: null, info: null })}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
