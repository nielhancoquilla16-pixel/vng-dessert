import React from 'react';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Keep diagnostics in developer logs, never in the rendered fallback.
    console.error('A render error was caught by the app boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-shell">
          <div className="app-error-card" role="alert">
            <h1>Something went wrong</h1>
            <p>Sorry, the requested page or information is currently unavailable. Please try again.</p>
            <button type="button" className="btn-login" onClick={() => window.location.reload()}>
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
