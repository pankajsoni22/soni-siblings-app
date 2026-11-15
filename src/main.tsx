import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { ToastProvider } from './components/ToastProvider.tsx';
import '@fontsource-variable/inter';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Refuse to run inside another site's frame, so a hostile page can't overlay the app and trick
// someone into clicking Delete or Save (clickjacking). GitHub Pages can't send the header that
// would normally do this (X-Frame-Options / frame-ancestors).
if (window.top !== window.self) {
  root.textContent = 'This app cannot be shown inside another page. Open it directly.';
  throw new Error('Refusing to run in a frame');
}

// HashRouter (URLs like /#/items/42) because GitHub Pages cannot serve deep links.
createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>
);
