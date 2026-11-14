import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The local server binds 127.0.0.1 only. `localhost` can resolve to ::1 first and miss it.
const target = process.env.TACIT_SERVER ?? 'http://127.0.0.1:8790';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // Shared imports are needed; backend files and credentials must never be served by Vite.
      allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared', import.meta.url))],
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**', '**/secrets.json'],
    },
    proxy: {
      '/api': target,
      '/ws': { target: target.replace(/^http/, 'ws'), ws: true },
    },
  },
});
