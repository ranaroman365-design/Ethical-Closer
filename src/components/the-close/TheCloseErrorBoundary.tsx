import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class TheCloseErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: Error) {
    console.error('[TheClose] Error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F2E9' }}>
          <div className="text-center px-6">
            <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', color: '#7A7568' }}>
              Etwas ist schiefgelaufen.
            </h1>
            <button onClick={() => window.location.reload()} className="mt-4 uppercase tracking-[0.2em] cursor-pointer"
              style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '10px 20px', background: '#141410', color: '#F7F2E9', border: 'none' }}>
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
