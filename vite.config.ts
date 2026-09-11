import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    test: {
      // Solo los tests de vitest. Los de scripts/lib/*.test.mjs son scripts
      // sueltos de node que terminan con process.exit(): se corren con
      // `npm run financiamiento:test` / `financiamiento:cuotas`, no acá.
      // Sin este include, vitest los levanta y los reporta como suite fallida
      // aunque hayan impreso "TODO OK".
      include: ['**/*.test.ts'],
    },
  };
});
