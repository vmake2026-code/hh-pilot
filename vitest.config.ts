import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  // P30: tsconfig.json sets "jsx": "preserve" (required by Next), which the
  // Oxc transform inherits — vite:import-analysis then rejects any .tsx source.
  // Overriding it for the test runner only makes .tsx modules importable;
  // `next build` uses its own SWC pipeline and is unaffected.
  // (Vite 8 replaced the `esbuild` option with `oxc`.)
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    include: ["__tests__/**/*.test.{ts,tsx}"],
  },
});
