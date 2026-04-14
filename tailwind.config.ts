// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Map CSS custom properties so Tailwind classes work alongside tokens.css
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        "accent-muted": "var(--color-accent-muted)",
        "bg-primary": "var(--color-bg-primary)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-overlay": "var(--color-bg-overlay)",
        "surface-dark": "var(--color-surface-dark)",
        "surface-mid": "var(--color-surface-mid)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-disabled": "var(--color-text-disabled)",
        border: "var(--color-border)",
        "border-focus": "var(--color-border-focus)",
        error: "var(--color-error)",
        warning: "var(--color-warning)",
        success: "var(--color-success)",
      },
      fontFamily: {
        editor: ["var(--font-editor)", "monospace"],
        prose: ["var(--font-prose)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
