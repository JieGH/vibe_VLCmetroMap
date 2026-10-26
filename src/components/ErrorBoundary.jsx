import React from 'react';
import { reportIncident } from '../utils/telemetry';

/**
 * Top-level React Error Boundary.
 * Catches unhandled render errors anywhere in the component tree, prevents the app
 * from unmounting into a solid black screen, logs telemetry incidents, and presents
 * a clear recovery action to the user.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Error:', error, errorInfo);
    try {
      reportIncident({
        error: error?.message || 'React Uncaught Error',
        stack: (error?.stack || '').slice(0, 1000),
        source: 'ErrorBoundary',
        componentStack: (errorInfo?.componentStack || '').slice(0, 500),
      });
    } catch {
      // Telemetry failure should not crash the error boundary
    }
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="app-error-boundary-screen"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: '#121212',
            color: '#ffffff',
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(226, 0, 26, 0.15)',
              border: '2px solid #E2001A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              color: '#E2001A',
              fontSize: '28px',
              fontWeight: 900,
            }}
          >
            !
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
            Ha ocorregut un error imprevist
          </h2>
          <p style={{ fontSize: '0.90rem', color: '#a0a0b0', maxWidth: 360, margin: '0 0 20px 0', lineHeight: 1.4 }}>
            Something went wrong. Tap below to reload the network map and resume your journey.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                background: '#E2001A',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '10px 20px',
                fontSize: '0.92rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(226, 0, 26, 0.4)',
                transition: 'transform 0.1s ease',
              }}
            >
              Reiniciar aplicació / Reload
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 12,
                padding: '10px 18px',
                fontSize: '0.92rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reintentar / Retry
            </button>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <pre
              style={{
                marginTop: 24,
                padding: 12,
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                fontSize: '0.75rem',
                textAlign: 'left',
                maxWidth: '90vw',
                overflowX: 'auto',
                color: '#ff8a80',
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
