import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

/**
 * The whiteboard's fonts are served by Igrek (and the hub's web page, for meetings) itself instead
 * of a CDN, so boards work offline and the page's strict rules need not allow another site.
 * The Chinese handwriting font (13 MB) is left out; such text falls back to a system font.
 */
export function excalidrawFonts(): Plugin {
  let outDir = "dist";
  // The package exports no package.json; its main entry sits in dist/prod next to the fonts.
  const from = join(dirname(createRequire(import.meta.url).resolve("@excalidraw/excalidraw")), "fonts");
  const fonts = existsSync(from) ? readdirSync(from).filter((f) => f !== "Xiaolai") : [];
  return {
    name: "excalidraw-fonts",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use("/excalidraw/fonts", (req, res, next) => {
        const file = join(from, decodeURIComponent((req.url ?? "").split("?")[0] ?? ""));
        if (!file.startsWith(from) || !existsSync(file) || file.includes("Xiaolai")) return next();
        res.setHeader("content-type", "font/woff2");
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      for (const f of fonts) cpSync(join(from, f), join(outDir, "excalidraw", "fonts", f), { recursive: true });
    },
  };
}
