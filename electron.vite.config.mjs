import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: true, // Ini sama dengan --host, mengizinkan akses dari network (HP)
      port: 5173,
      proxy: {
        '^/models/(Xenova|onnx-community)/.*': {
          target: 'https://huggingface.co',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/models\/(Xenova|onnx-community)\/(.*?)(\/resolve\/main)?\/(.*)$/, '/$1/$2/resolve/main/$4')
        }
      }
    }
  }
})
