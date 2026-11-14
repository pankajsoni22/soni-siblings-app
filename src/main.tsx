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
