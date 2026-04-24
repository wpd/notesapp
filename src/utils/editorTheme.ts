// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * NotesApp CodeMirror theme — uses CSS custom properties from tokens.css
 * to match the coral/terracotta design.
 */

import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";

export const notesAppTheme: Extension = EditorView.theme(
  {
    "&": {
      height: "100%",
      background: "var(--color-bg-primary)",
      color: "var(--color-text-primary)",
      fontFamily: "var(--font-editor)",
      fontSize: "var(--font-size-editor-default)",
    },
    ".cm-content": {
      caretColor: "var(--color-accent)",
      padding: "8px 0",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--color-accent)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      background: "rgba(204, 120, 92, 0.25)",
    },
    ".cm-gutters": {
      background: "var(--color-bg-secondary)",
      color: "var(--color-text-disabled)",
      border: "none",
      borderRight: "1px solid var(--color-border)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      paddingLeft: "8px",
      paddingRight: "8px",
    },
    ".cm-activeLine": {
      background: "rgba(0, 0, 0, 0.03)",
    },
    ".cm-activeLineGutter": {
      background: "var(--color-bg-secondary)",
      color: "var(--color-text-secondary)",
    },
    // Markdown-specific token colors
    ".cm-heading": {
      color: "var(--color-accent)",
      fontWeight: "bold",
    },
    ".cm-strong": {
      fontWeight: "bold",
    },
    ".cm-emphasis": {
      fontStyle: "italic",
    },
    ".cm-monospace, .cm-code": {
      fontFamily: "var(--font-editor)",
      background: "rgba(0,0,0,0.04)",
      borderRadius: "2px",
    },
    ".cm-link": {
      color: "#0066cc",
      textDecoration: "underline",
    },
    ".cm-url": {
      color: "#0066cc",
    },
    // LaTeX / Mermaid distinct token highlighting (ROADMAP §Phase 1)
    ".cm-math-inline": {
      color: "#7c3aed",
      background: "rgba(124, 58, 237, 0.06)",
      borderRadius: "2px",
    },
    ".cm-math-display": {
      color: "#7c3aed",
      background: "rgba(124, 58, 237, 0.10)",
      borderRadius: "2px",
      fontWeight: "500",
    },
    ".cm-mermaid-block": {
      color: "#0e7490",
      background: "rgba(14, 116, 144, 0.08)",
      borderRadius: "2px",
    },
  },
  { dark: false },
);
