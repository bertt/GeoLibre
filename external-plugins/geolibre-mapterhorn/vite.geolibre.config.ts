import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Builds the self-contained ESM bundle GeoLibre loads as an external plugin:
// geolibre-plugin/dist/index.js (+ style.css, if any global CSS is added
// later). See docs/plugin-api.md "Bundled plugins" / "External plugins".
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/geolibre.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "geolibre-plugin/dist",
    emptyOutDir: true,
    rollupOptions: {
      // maplibre-gl is provided by the GeoLibre host; do not bundle a second
      // copy (it would create a duplicate WebGL context / style engine).
      external: ["maplibre-gl"],
    },
    cssCodeSplit: false,
    sourcemap: false,
    minify: false,
  },
});
