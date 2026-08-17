// electron.vite.config.mjs
import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
var __electron_vite_injected_dirname = "D:\\My Project\\mark-project\\mark";
var electron_vite_config_default = defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/preload/index.js")
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      // Ini sama dengan --host, mengizinkan akses dari network (HP)
      port: 5173
    }
  }
});
export {
  electron_vite_config_default as default
};
