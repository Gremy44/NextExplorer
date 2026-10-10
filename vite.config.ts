import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: { index: "index.html", "collect-background": "src/collect-background.ts", "download-background": "src/download-background.ts" },
      output: {
        entryFileNames: (chunk) => chunk.name.endsWith("-background") ? `${chunk.name}.js` : "assets/[name]-[hash].js",
        manualChunks: {
          syntax: ["highlight.js/lib/common"],
          web: ["@mozilla/readability", "marked", "dompurify"],
        },
      },
    },
  },
});
