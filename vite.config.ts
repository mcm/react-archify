import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    dts({ include: ['src'], exclude: ['src/vendor/**/*.js', 'src/vendor/**/*.mjs'], rollupTypes: true, tsconfigPath: './tsconfig.json' }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'react-archify.js',
    },
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
