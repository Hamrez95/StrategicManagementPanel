import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  // Resolve internal packages from this checkout even when dependency caches are shared.
  resolve: {
    alias: [
      {
        find: /^@stratino\/ui$/,
        replacement: fileURLToPath(new URL('../../packages/ui/src/index.tsx', import.meta.url)),
      },
      ...['academy', 'evaluation-matrices', 'metric-calculations'].map((name) => ({
        find: `@stratino/domain/${name}`,
        replacement: fileURLToPath(
          new URL(`../../packages/domain/dist/${name}.js`, import.meta.url),
        ),
      })),
      {
        find: /^@stratino\/domain$/,
        replacement: fileURLToPath(new URL('../../packages/domain/dist/index.js', import.meta.url)),
      },
    ],
  },
  build: { outDir: '../../dist', emptyOutDir: false },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8000' } },
});
