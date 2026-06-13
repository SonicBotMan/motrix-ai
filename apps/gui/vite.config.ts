import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/btdig': {
        target: 'https://btdig.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/btdig/, ''),
      },
      '/api/mikan': {
        target: 'https://mikanani.me',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mikan/, ''),
      },
      '/api/1337x': {
        target: 'https://1337x.to',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/1337x/, ''),
      },
      '/api/nyaa': {
        target: 'https://nyaa.si',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nyaa/, ''),
      },
      '/api/torrentgalaxy': {
        target: 'https://torrentgalaxy.to',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/torrentgalaxy/, ''),
      },
    },
  },
})
