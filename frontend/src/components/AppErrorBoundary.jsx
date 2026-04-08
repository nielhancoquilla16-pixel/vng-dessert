import React from 'react';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('A render error was caught by the app boundary:', error);
    console.error('Error Info:', errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    // Clear sessionStorage related to auth
    try {
      Object.keys(window.sessionStorage).forEach((key) => {
        if (key.includes('vng') || key.includes('recovery')) {
          window.sessionStorage.removeItem(key);
        }
      });
    } catch (e) {
      // Ignore storage errors
    }
    
    // Clear localStorage related to auth
    try {
      Object.keys(window.localStorage).forEach((key) => {
        if (key.includes('sb-') && key.includes('auth')) {
          window.localStorage.removeItem(key);
          window.localStorage.removeItem(`${key}-code-verifier`);
        }
      });
    } catch (e) {
      // Ignore storage errors
    }
    
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-shell">
          <div className="app-error-card">
            <h1>Something went wrong</h1>
            <p>The app hit an unexpected error, but your project files are still safe.</p>
            {this.state.error && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#fee2e2',
                borderRadius: '8px',
                fontSize: '12px',
                maxHeight: '200px',
                overflow: 'auto',
                color: '#991b1b',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <strong>Error:</strong> {this.state.error.toString()}
                {this.state.errorInfo?.componentStack && (
                  <>
                    <br />
                    <br />
                    <strong>Stack:</strong>
                    <br />
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </div>
            )}
            <button type="button" className="btn-login" onClick={this.handleReload}>
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
