import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest (nao generateSW) - precisa de um service worker custom
      // (src/sw.ts) pra lidar com eventos push/notificationclick das notificacoes
      // inteligentes (Premium). Com generateSW o workbox gera o SW inteiro sozinho
      // e nao da pra injetar handlers de evento customizados nele.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pomofoca',
        short_name: 'Pomofoca',
        description: 'Pomodoro com relatórios detalhados de estudo por matéria',
        theme_color: '#161826',
        background_color: '#161826',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      // Sem isso o SW so registra num build de producao - precisamos dele ativo em
      // `npm run dev:web` pra poder testar push notification sem buildar toda vez.
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@pomofoca/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
