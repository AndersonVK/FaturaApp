import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/FaturaApp/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/FaturaApp/',
        name: 'FaturaApp - Controle de Faturas',
        short_name: 'FaturaApp',
        description: 'Controle pessoal de faturas de cartão de crédito por pessoa/empresa',
        start_url: '/FaturaApp/',
        scope: '/FaturaApp/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // pdf.js worker is fetched at runtime; cache it too so import works offline
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.worker.mjs'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdf-worker-cache' },
          },
        ],
      },
    }),
  ],
})
