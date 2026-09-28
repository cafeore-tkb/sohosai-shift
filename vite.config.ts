import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vitest/config";

// ビルドごとの ID。index.html の <meta name="shift-build"> とアプリの __BUILD_ID__ に入れ、開きっぱなしの古い版で配信しないように比べる（sync/firebase.ts）
const BUILD_ID = Date.now().toString(36);

// base: "./" と単一ファイル化で、dist/index.html をダブルクリック（file://）でも Web でも動かす
export default defineConfig({
  base: "./",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    viteSingleFile(),
    { name: "shift-build-id", transformIndexHtml: (html) => html.replace("</head>", `  <meta name="shift-build" content="${BUILD_ID}" />\n  </head>`) },
  ],
  test: { include: ["src/**/*.test.ts", "worker/src/**/*.test.ts"] },
});
