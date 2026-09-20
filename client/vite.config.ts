import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser talks to Vite (same origin) and Vite forwards /api to the Express server,
// so the HttpOnly refresh cookie behaves exactly like production (where Vercel rewrites /api).
// WebSockets connect straight to the API origin (VITE_SOCKET_URL).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
});
