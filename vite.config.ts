import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'node:fs';
import Pages from 'vite-plugin-pages';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(() => {
  // For multi-file builds, do not inline the favicon. Ensure a standard link exists (optional safeguard).
  const ensureFaviconLinkPlugin = {
    name: 'ensure-favicon-link',
    apply(_config: unknown, { command }: { command: string }) {
      return command === 'build';
    },
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        const icoPath = path.resolve(__dirname, 'public/favicon.ico');
        if (!fs.existsSync(icoPath)) return html;
        const tag = `<link rel="icon" type="image/x-icon" href="/favicon.ico">`;
        return html.includes('rel="icon"')
          ? html
          : html.replace('</head>', `${tag}\n</head>`);
      }
    }
  };
  // No cleanup for multi-file builds; keep favicon.ico in output
  return {
    base: '/lightXtool/',
    plugins: [
      react(),
      Pages({
        dirs: [{ dir: 'src/artifacts', baseRoute: '' }],
        extensions: ['jsx', 'tsx'],
      }),
      ensureFaviconLinkPlugin,
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: { enabled: true },
        includeAssets: ['favicon.ico', 'logo.png'],
        manifest: {
          name: 'lightXtool',
          short_name: 'lightXtool',
          description: 'Galería personal de artifacts de Claude — Gilberto Santacolomba',
          theme_color: '#00A0FA',
          background_color: '#000000',
          display: 'standalone',
          // start_url y scope se calculan solos a partir de "base" (arriba) según
          // la documentación oficial del plugin — no los fijamos a mano para evitar
          // que queden desincronizados si cambia el base más adelante.
          // Íconos: los prefijamos a mano con '/lightXtool/' porque hay un bug
          // conocido del plugin donde el manifest no hereda "base" automáticamente
          // (github.com/vite-pwa/vite-plugin-pwa/issues/713).
          icons: [
            { src: '/lightXtool/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/lightXtool/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: '/lightXtool/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'src': path.resolve(__dirname, './src'),
      },
    }
  }
})
