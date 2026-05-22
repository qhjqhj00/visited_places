import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = `http://localhost:${process.env.API_PORT || 3001}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': apiTarget },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': apiTarget },
  },
});
