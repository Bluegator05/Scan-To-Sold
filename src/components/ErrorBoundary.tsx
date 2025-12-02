
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-200 font-sans">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/30">
            <AlertTriangle size={40} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-slate-400 mb-6 max-w-xs mx-auto">
            The application encountered an unexpected error.
          </p>
          
          <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 mb-8 w-full max-w-md overflow-auto text-left">
            <code className="text-xs text-red-300 font-mono break-all">
              {this.state.error?.message || "Unknown Error"}
            </code>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors"
            >
              <RefreshCw size={18} /> Reload App
            </button>
            
            <button
              onClick={this.handleReset}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-red-900/30 hover:bg-red-900/50 text-red-200 border border-red-900 rounded-lg font-bold transition-colors"
            >
              <Trash2 size={18} /> Reset Data & Reload
            </button>
            <span className="text-[10px] text-slate-600 mt-2">
              Warning: Resetting data clears local storage.
            </span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
