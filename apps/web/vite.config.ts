import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { excalidrawFonts } from "./vite.excalidraw";

const API = "http://localhost:7777";

// The server only accepts its own Origin, so the dev proxy presents itself as that origin.
const asServerOrigin = {
  target: API,
  changeOrigin: true,
  configure: (proxy: {
    on: (event: string, cb: (req: { setHeader: (k: string, v: string) => void }) => void) => void;
  }) => {
    proxy.on("proxyReq", (req) => req.setHeader("origin", API));
    proxy.on("proxyReqWs", (req) => req.setHeader("origin", API));
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), excalidrawFonts()],
  resolve: {
    alias: [
      // monaco-vim still imports Monaco's pre-0.50 file layout.
      { find: /^monaco-editor\/esm\/vs\/(.*)$/, replacement: "monaco-editor/$1" },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": asServerOrigin,
      "/ws": { ...asServerOrigin, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The web member's page (served by the team hub) is a second entry next to the app.
    rollupOptions: { input: { main: "index.html", member: "member.html" } },
  },
});
