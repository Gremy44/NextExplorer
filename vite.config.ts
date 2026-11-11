import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
export default defineConfig({
  base: "./",
  optimizeDeps: { entries: ["index.html"] },
  server: {
    watch: { ignored: ["**/test-results/**", "**/release/**", "**/.tools/**"] },
  },
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(version) },
  plugins: [
    react(),
    {
      name: "local-pdf-resources",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(
            {
              ...JSON.parse(readFileSync("public/manifest.json", "utf8")),
              version,
            },
            null,
            2,
          ),
        });
        for (const directory of ["cmaps", "standard_fonts"]) {
          for (const name of readdirSync(
            `node_modules/pdfjs-dist/${directory}`,
          )) {
            this.emitFile({
              type: "asset",
              fileName: `pdfjs/${directory}/${name}`,
              source: readFileSync(
                `node_modules/pdfjs-dist/${directory}/${name}`,
              ),
            });
          }
        }
        for (const [packageName, file] of [
          ["react", "LICENSE"],
          ["react-dom", "LICENSE"],
          ["scheduler", "LICENSE"],
          ["lucide-react", "LICENSE"],
          ["@tanstack/react-virtual", "LICENSE"],
          ["@tanstack/virtual-core", "LICENSE"],
          ["@mozilla/readability", "LICENSE.md"],
          ["marked", "LICENSE.md"],
          ["dompurify", "LICENSE"],
          ["highlight.js", "LICENSE"],
          ["pdf-lib", "LICENSE.md"],
          ["pdfjs-dist", "LICENSE"],
          ["@pdf-lib/standard-fonts", "LICENSE.md"],
          ["@pdf-lib/upng", "LICENSE"],
          ["pako", "LICENSE"],
          ["tslib", "LICENSE.txt"],
          ["@xterm/xterm", "LICENSE"],
          ["@xterm/addon-fit", "LICENSE"],
        ])
          this.emitFile({
            type: "asset",
            fileName: `licenses/${packageName.replaceAll("/", "-")}.txt`,
            source: readFileSync(`node_modules/${packageName}/${file}`),
          });
        this.emitFile({
          type: "asset",
          fileName: "licenses/nextexplorer.txt",
          source: readFileSync("LICENSE"),
        });
      },
      configureServer(server) {
        server.middlewares.use("/pdfjs", (request, response, next) => {
          const parts = (request.url || "").split("/").filter(Boolean);
          if (
            parts.length !== 2 ||
            !["cmaps", "standard_fonts"].includes(parts[0]) ||
            !/^[\w.-]+$/.test(parts[1])
          )
            return next();
          try {
            response.setHeader("Content-Type", "application/octet-stream");
            response.end(
              readFileSync(path.join("node_modules/pdfjs-dist", ...parts)),
            );
          } catch {
            next();
          }
        });
      },
    },
  ],
  worker: { format: "es" },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        index: "index.html",
        "collect-background": "src/collect-background.ts",
        "download-background": "src/download-background.ts",
        "organization-background": "src/organization-background.ts",
        "mcp-background": "src/mcp-background.ts",
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name.endsWith("-background")
            ? `${chunk.name}.js`
            : "assets/[name]-[hash].js",
        manualChunks: {
          syntax: ["highlight.js/lib/common"],
          web: ["@mozilla/readability", "marked", "dompurify"],
        },
      },
    },
  },
});
