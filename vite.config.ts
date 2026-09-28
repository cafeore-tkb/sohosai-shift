import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vitest/config";

// base: "./" と単一ファイル化で、dist/index.html をダブルクリック（file://）でも GitHub Pages でも動かす
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  test: { include: ["src/**/*.test.ts", "worker/src/**/*.test.ts"] },
});
