import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "web",
  base: "/next/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./web", import.meta.url)) } },
  build: { outDir: "../docs/next", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/data": "http://127.0.0.1:4173",
      "/assets": "http://127.0.0.1:4173",
      "/fonts": "http://127.0.0.1:4173",
      "/api": "http://127.0.0.1:4173",
    },
  },
});
