import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/fmc': {
        target: 'https://fmcrestapisandbox.cisco.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/fmc/, '')
      }
    }
  }
})
