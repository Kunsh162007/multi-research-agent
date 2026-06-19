import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/research': 'http://localhost:8000',
      '/resume': 'http://localhost:8000',
      '/history': 'http://localhost:8000',
      '/monitor': 'http://localhost:8000',
      '/share': 'http://localhost:8000',
      '/stats': 'http://localhost:8000',
    },
  },
})
