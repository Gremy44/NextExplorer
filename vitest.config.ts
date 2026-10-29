import { defineConfig, mergeConfig } from "vitest/config";
import app from "./vite.config";

// Generated corpora, releases and the local Go toolchain are not test sources.
export default mergeConfig(
  app,
  defineConfig({
    test: { include: ["src/**/*.test.{ts,tsx}", "scripts/*.test.mjs"] },
  }),
);
