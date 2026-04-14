// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";

/**
 * Root application component.
 *
 * Phase 1 bootstrap: renders a placeholder shell.
 * Full tiling layout (react-mosaic) is wired up in the next commit.
 */
export default function App(): React.ReactElement {
  return (
    <div
      data-testid="app-root"
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-prose)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p>NotesApp — Phase 1 scaffold</p>
    </div>
  );
}
