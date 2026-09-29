import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: '0.0.0.0',
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
              code: 503,
              error: 'This service is temporarily unavailable. Please try again shortly.',
            }))
          })
        },
      }
    }
  }
})
