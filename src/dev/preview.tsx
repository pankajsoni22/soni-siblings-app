/**
 * Development only (npm run dev, then /soni-siblings-app/preview.html): the real app, signed in
 * as a fake admin, against an in-browser mock backend. Not included in the production build.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '../App.tsx';
import { AuthContext, type AuthContextValue } from '../auth/authContext.ts';
import { ToastProvider } from '../components/ToastProvider.tsx';
import { config } from '../config.ts';
import '../styles.css';
import { installMockBackend } from './mockBackend.ts';

installMockBackend(config.apiUrl);

const auth: AuthContextValue = {
  status: 'ready',
  session: { token: 'preview', exp: Date.now() + 10 * 365 * 864e5, profile: { email: 'pankaj@gmail.com', name: 'Pankaj (preview)' } },
  me: { email: 'pankaj@gmail.com', name: 'Pankaj', role: 'ADMIN', isOwner: true },
  gsiReady: false,
  error: '',
  expire: () => {},
  signOut: () => {}
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <App />
        </AuthContext.Provider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>
);
