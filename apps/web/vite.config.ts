import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * The whiteboard's fonts are served by God Eye itself instead of a CDN, so boards work offline.
 * The Chinese handwriting font (13 MB) is left out; such text falls back to a system font.
 */
function excalidrawFonts(): Plugin {
  // The package exports no package.json; its main entry sits in dist/prod next to the fonts.
  const from = join(dirname(createRequire(import.meta.url).resolve("@excalidraw/excalidraw")), "fonts");
  const fonts = existsSync(from) ? readdirSync(from).filter((f) => f !== "Xiaolai") : [];
  return {
    name: "excalidraw-fonts",
    configureServer(server) {
      server.middlewares.use("/excalidraw/fonts", (req, res, next) => {
        const file = join(from, decodeURIComponent((req.url ?? "").split("?")[0] ?? ""));
        if (!file.startsWith(from) || !existsSync(file) || file.includes("Xiaolai")) return next();
        res.setHeader("content-type", "font/woff2");
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      for (const f of fonts) cpSync(join(from, f), join("dist", "excalidraw", "fonts", f), { recursive: true });
    },
  };
}

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
  build: { outDir: "dist", emptyOutDir: true },
});
