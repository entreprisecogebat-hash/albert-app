import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// L'API Symfony tourne sur :8000 ; le proxy evite toute configuration CORS en dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/files': 'http://127.0.0.1:8000',
      // Liens de partage publics (F-06)
      '/s/': 'http://127.0.0.1:8000',
    },
  },
});
