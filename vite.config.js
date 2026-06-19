import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            res.writeHead(502, {
              'Content-Type': 'application/json',
            });
            res.end(JSON.stringify({
              success: false,
              message: 'Backend unavailable'
            }));
          });
        }
      }
    }
  }
});
