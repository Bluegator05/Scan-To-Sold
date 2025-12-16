
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';


// --- GLOBAL ERROR TRAP FOR DEBUGGING ---
window.onerror = function (message, source, lineno, colno, error) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="background:black;color:red;padding:20px;font-family:monospace;white-space:pre-wrap;">
        <h1>CRITICAL ERROR</h1>
        <p>${message}</p>
        <p>${source}:${lineno}:${colno}</p>
        <pre>${error?.stack || ''}</pre>
      </div>
    `;
  }
};
// ----------------------------------------

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
