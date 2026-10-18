import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Only the web member's page (plan.md 4.3), for the team hub's image: none of the app's editors,
 * boards or terminals, so the hub stays small. `bun run build:member` writes dist-member/.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-member",
    emptyOutDir: true,
    rollupOptions: { input: { member: "member.html" } },
  },
});
