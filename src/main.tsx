import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

/** Keeps a WebGL or shader failure from showing the player a blank page. */
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[MOT] fatal', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen">
          <div className="panel pad" style={{ maxWidth: 560 }}>
            <div className="label">Something went wrong</div>
            <div className="h2 mt-s">The outpost could not be rendered</div>
            <p className="small body-dim mt-m">
              This usually means WebGL is unavailable or disabled in this browser.
              Try a desktop browser with hardware acceleration enabled.
            </p>
            <pre className="tiny body-dim mt-m" style={{ whiteSpace: 'pre-wrap' }}>
              {this.state.error.message}
            </pre>
            <button className="btn primary mt-m" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
)
