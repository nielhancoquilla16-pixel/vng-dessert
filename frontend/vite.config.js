import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error(`[vite] API proxy failed for ${req.url}: ${err.code ?? err.message}`)

            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
            }

            res.end(JSON.stringify({
              error: 'Backend server is unavailable. Start dessert-ai-system on port 3001.',
            }))
          })
        },
      }
    }
  }
})
