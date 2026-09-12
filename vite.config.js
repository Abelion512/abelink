import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Tauri desktop = file lokal, bukan network. Chunk besar (monaco 7MB,
    // ort-wasm 23MB, transformers) disengaja; jangan spam warning 500kB.
    chunkSizeWarningLimit: 1500,
    // Pisah vendor berat ke chunk sendiri: cache stabil + load paralel.
    // (Lihat plan optimasi bundle: entry 2.4MB didominasi depTransitif ini.)
    rollupOptions: {
      // Lazy db<->oramaStore (pemutus siklus) + vectorMemory (kebijakan
      // transformers) disengaja: modul inti memang di main chunk, dynamic
      // import di sana untuk lazy-init, bukan code-split. Bungkam warn itu saja.
      onwarn(warning, warn) {
        if (
          warning?.message?.includes('dynamically imported') &&
          warning?.message?.includes('statically imported')
        )
          return
        warn(warning)
      },
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-monaco': ['@monaco-editor/react', 'monaco-editor'],
          'vendor-graph': ['react-force-graph-2d', 'three'],
          'vendor-md': ['react-markdown', 'remark-gfm', 'react-syntax-highlighter'],
          'vendor-icons': ['react-icons', 'lucide-react'],
          'vendor-db': ['dexie', 'dexie-export-import', '@orama/orama']
        }
      }
    }
  },
}));
