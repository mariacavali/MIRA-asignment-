import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
// Local green review: no Manus collector or env file. API proxy targets only the isolated loopback service.
export default defineConfig({ root: path.join(root, "client"), envDir: false,
  plugins: [react(), tailwindcss()], resolve: { alias: {
    "@": path.join(root, "client/src"), "@shared": path.join(root, "shared"), "@assets": path.join(root, "attached_assets"),
  } }, server: { host: "127.0.0.1", port: 5183, strictPort: true, proxy: { "/api/mira-session": { target: "http://127.0.0.1:5184", changeOrigin: false }, "/api/trpc": { target: "http://127.0.0.1:5184", changeOrigin: false } }, fs: { deny: ["**/.*"] } },
});
