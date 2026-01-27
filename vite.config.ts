import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/mysql-upgrade-checker/',
  root: 'src',
  build: {
    outDir: '../dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    emptyOutDir: true,
  },
})
