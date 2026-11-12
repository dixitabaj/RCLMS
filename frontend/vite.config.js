
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],

  server: {
    proxy: {
      // Django backend
      '/backend': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend/, '')
      },

      // ArcGIS services
      '/arcgis': {
        target: 'https://geoapps.icimod.org/icimodarcgis',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/arcgis/, '')
      }
    }
  }
})
