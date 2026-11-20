import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo, /api se reenvía a la API local (docker compose o uvicorn).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_DEV ?? 'http://localhost:8000' } },
})
