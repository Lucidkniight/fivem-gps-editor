import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import postcss from './postcss.config.js';
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
    css: {
      postcss,
    },
    plugins: [svelte({
      /* plugin options */
    })],
    base: './', // relative paths so the build works from a subpath or file://  (Electron)
    resolve: {
      alias: {
        '@assets': resolve("./src/assets"),
        '@utils': resolve("./src/utils"),
        '@typings': resolve("./src/typings"),
        '@lib': resolve('./src/lib'),
      },
    },
    server: {
        port: 3000,
      },
    build: {
      emptyOutDir: true,
      outDir: 'dist',
    }
  })
  