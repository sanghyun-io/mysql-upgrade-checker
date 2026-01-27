import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/mysql-upgrade-checker/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
  },
})
