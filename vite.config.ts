import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
  }
});
