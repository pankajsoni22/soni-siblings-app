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
import '@fontsource-variable/inter';
import '../styles.css';
import { apiCalls, installMockBackend } from './mockBackend.ts';

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

/**
 * preview.html?axe#/route runs the axe-core accessibility checker on that screen after it loads
 * and writes the findings into the page (and the console), so a headless browser can read them
 * with --dump-dom.
 */
/**
 * preview.html?calls=/transactions,/settings#/ opens the first screen, then visits each listed route
 * (1.5 s apart, like clicking around) and writes every API call made into the page, for --dump-dom.
 */
const visits = new URLSearchParams(location.search).get('calls');
if (visits !== null) {
  const routes = visits ? visits.split(',') : [];
  routes.forEach((r, i) => window.setTimeout(() => { location.hash = r; }, 1500 * (i + 1)));
  window.setTimeout(() => {
    const out = document.createElement('pre');
    out.id = 'api-calls';
    out.textContent = `CALLS ${apiCalls.length}: ${apiCalls.join(' ')}`;
    document.body.append(out);
  }, 1500 * (routes.length + 1));
}

if (new URLSearchParams(location.search).has('axe')) {
  window.setTimeout(() => {
    void import('axe-core').then(async ({ default: axe }) => {
      const result = await axe.run(document, { resultTypes: ['violations'] });
      const lines = result.violations.map(v =>
        `${v.impact ?? 'n/a'} | ${v.id} | ${v.help} | ${v.nodes.length} | ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' ; ')}`);
      const out = document.createElement('pre');
      out.id = 'axe-results';
      out.textContent = `AXE ${location.hash} violations=${result.violations.length}\n${lines.join('\n')}`;
      document.body.append(out);
      console.info(out.textContent);
    });
  }, 1500);
}

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
