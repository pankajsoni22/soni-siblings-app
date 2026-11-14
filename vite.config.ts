import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy for the production build. GitHub Pages can't send headers, so it goes
 * in a <meta> tag. It allows only this site, Google sign-in and the Apps Script API; anything
 * else (injected scripts, unknown hosts) is refused by the browser. Dev mode is left out because
 * Vite's dev server injects inline scripts.
 * Sources: Google Identity Services CSP guidance (accounts.google.com/gsi/*); the Apps Script
 * web app answers from script.google.com and redirects to script.googleusercontent.com.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/',
  "img-src 'self' data: https://*.googleusercontent.com https://*.gstatic.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }]
});

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  // The site is served from https://<username>.github.io/<repo>/, so this must match the repo name.
  // Use '/' only for a <username>.github.io repo or a custom domain.
  base: '/soni-siblings-app/',
  server: {
    // Port 8000 reuses the http://localhost:8000 origin already registered on the OAuth client.
    port: 8000,
    strictPort: true
  },
  preview: {
    port: 8000,
    strictPort: true
  },
  test: {
    // Frontend unit tests only; the backend has its own runner (npm run test:backend).
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
