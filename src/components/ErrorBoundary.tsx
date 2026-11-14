import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence: if a screen throws while rendering, show a calm message with a way out
 * instead of a blank page. Saved data is never at risk here; it lives on the server.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main>
        <section className="card center" role="alert">
          <h1>Something went wrong on this screen</h1>
          <p className="muted">Your saved entries are safe. Reloading usually fixes this.</p>
          <p className="muted error-detail">{this.state.error.message}</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>Reload</button>
        </section>
      </main>
    );
  }
}
