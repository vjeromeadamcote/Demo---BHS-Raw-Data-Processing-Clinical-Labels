import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Workbench proxy serves the app at a sub-path like
// https://workbench.verily.com/app/<UUID>/proxy/8080/. All assets and API calls
// MUST use relative paths. `base: './'` emits relative URLs in the bundle.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: !process.env.VITE_NO_MINIFY,
  },
})
