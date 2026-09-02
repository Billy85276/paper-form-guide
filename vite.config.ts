import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 相對路徑，這樣同一份產出可以放在 Vercel 根目錄、GitHub Pages 子路徑，
  // 甚至直接用 file:// 開啟都不會壞掉。
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'sample-form.jpg'],
      manifest: {
        name: '實體表單引導',
        short_name: '表單引導',
        description: '把紙本表單變成看得懂的線上引導',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,webp,woff2}'],
        // 表單照片可能不小，放寬單檔預快取上限
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // 打成單一 JS 檔，才能在瀏覽器裡把整個應用程式內嵌進一份離線 HTML。
    // 這不是效能設定，是功能需求：有 code splitting 的話離線版會缺檔案而開不起來。
    rollupOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
    chunkSizeWarningLimit: 2000,
  },
});
