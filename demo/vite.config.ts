import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
