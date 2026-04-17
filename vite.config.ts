// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { HtmlTagDescriptor, IndexHtmlTransformResult } from "vite";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    // Remove the `crossorigin` attribute that Vite adds to <script type="module">
    // tags.  WebKit's tauri:// custom scheme does not respond with
    // Access-Control-Allow-Origin headers, so `crossorigin="anonymous"` causes
    // the static script tag to be silently blocked in the WebKitWebDriver
    // automation context.  Dynamic import() is unaffected and works fine.
    {
      name: "strip-crossorigin",
      transformIndexHtml(html: string): IndexHtmlTransformResult {
        // Remove crossorigin attribute from all <script> and <link> tags
        return html
          .replace(/<script([^>]*?)\s+crossorigin(?:="[^"]*")?([^>]*)>/gi, "<script$1$2>")
          .replace(/<link([^>]*?)\s+crossorigin(?:="[^"]*")?([^>]*)>/gi, "<link$1$2>") as HtmlTagDescriptor[] | string;
      },
    },
  ],

  // Vite options tailored for Tauri development — prevent Vite from
  // obscuring Rust errors with a generic "WebSocket failed" overlay.
  clearScreen: false,

  // Tauri expects a fixed port; fail if that port is not available.
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
