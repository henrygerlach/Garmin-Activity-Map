import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Shared with the backend: env vars live in the repo root .env, not frontend/.env.
  envDir: path.resolve(import.meta.dirname, '..'),
})
