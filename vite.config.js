import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      // Proxies /groq-api/* → https://api.groq.com/openai/*
      // Only needed if Groq blocks direct browser requests (CORS error).
      // To use: change fetch URL in App.vue from
      //   'https://api.groq.com/openai/v1/chat/completions'
      // to
      //   '/groq-api/v1/chat/completions'
      '/groq-api': {
        target: 'https://api.groq.com/openai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/groq-api/, ''),
      },
    },
  },
})

