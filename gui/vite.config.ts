import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const backendPort = process.env.PORT || '5000'
const backendHost = process.env.HOST || '127.0.0.1'
const backendUrl = process.env.VITE_BACKEND_URL || `http://${backendHost}:${backendPort}`

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
    }
  }
})
