import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal Vite config for testing
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(
      new Date().toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      })
    ),
  },
  server: {
    port: 3003,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/upload': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
