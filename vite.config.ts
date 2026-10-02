import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

// Ícono de los accesos directos (mantener apretado el ícono en Android/escritorio).
const iconoAtajo = [{src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png'}];

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        /*
          'prompt' y NO 'autoUpdate': autoUpdate recarga la página apenas hay
          versión nueva, y en el POS eso tira el carrito de una venta a medio
          cobrar. Con 'prompt' la versión nueva espera y AvisoActualizacion le
          pregunta al operador cuándo.
        */
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          id: '/',
          name: 'Panda POS — Sistema de Gestión',
          short_name: 'Panda POS',
          description: 'Punto de venta, inventario y compras de Panda Store.',
          lang: 'es',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#09090b',
          theme_color: '#18181b',
          categories: ['business', 'productivity'],
          icons: [
            {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
            {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
            {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
          ],
          shortcuts: [
            {name: 'Terminal POS', short_name: 'Vender', url: '/pos', icons: iconoAtajo},
            {name: 'Control de Inventario', short_name: 'Inventario', url: '/inventory', icons: iconoAtajo},
            {name: 'Historial de Ventas', short_name: 'Historial', url: '/history', icons: iconoAtajo},
            {name: 'Compras', url: '/purchases', icons: iconoAtajo},
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          // El chunk principal ya roza el tope por defecto de workbox (2 MiB;
          // medía 2,0 MB en 2026-10). Si lo pasa, workbox lo deja afuera del
          // precache con sólo un warning en el build, y la app no abre sin red.
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // index.css importa Inter de Google Fonts.
              urlPattern: ({url}) =>
                url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
              handler: 'StaleWhileRevalidate',
              options: {cacheName: 'fuentes', expiration: {maxEntries: 20}},
            },
          ],
        },
      }),
    ],
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
