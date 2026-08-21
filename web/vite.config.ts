import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Service worker (##65): cachea el app shell y las respuestas GET minimas (usuario, meses,
    // registros rapidos) para que /r cargue y sea usable sin conexion. El manifest.json existente
    // (Fase 2) se deja tal cual — manifest:false evita que el plugin genere uno nuevo.
    VitePWA({
      manifest: false,
      injectRegister: null,
      registerType: 'autoUpdate',
      devOptions: { enabled: true, type: 'module' },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // /auth/me, /users, /months, /quick-entries, /quick-entry-types: lo minimo para que
            // el formulario de Registro rapido cargue offline (ver docs del ticket ##65).
            // quick-entry-types se agrego en ##73 -- sin cache, el selector de tipos se queda
            // vacio sin conexion. NetworkFirst con timeout corto: si hay red se usa la respuesta
            // fresca, si no cae al cache mas reciente.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.pathname.startsWith('/api/') &&
              (url.pathname === '/api/auth/me' ||
                url.pathname === '/api/users' ||
                url.pathname === '/api/months' ||
                url.pathname === '/api/quick-entries' ||
                url.pathname === '/api/quick-entry-types'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get-cache',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // permite conexiones desde fuera del contenedor cuando corre en Docker
    watch: {
      // bind mount Windows -> Linux no propaga inotify; forzar polling dentro de Docker
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
      interval: 300,
    },
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
