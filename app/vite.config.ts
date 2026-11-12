import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

// The dApp is a part of the site: served at /app, and built into site/app so
// that one deploy ships both.
export default defineConfig({
  base: "/app/",
  plugins: [react()],
  build: {outDir: "../site/app", emptyOutDir: true, sourcemap: false},
});
