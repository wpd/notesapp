// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";

interface MissingTileProps {
  tileId: string;
  missingPath: string;
  onLocate: () => void;
  onOpenDifferent: () => void;
  onClose: () => void;
}

export default function MissingTile({
  tileId,
  missingPath,
  onLocate,
  onOpenDifferent,
  onClose,
}: MissingTileProps): React.ReactElement {
  const dirHint = deriveDirectoryScope(missingPath);

  return (
    <div
      data-testid={`missing-tile-${tileId}`}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-primary)",
        padding: "2rem",
        fontFamily: "var(--font-prose)",
        gap: "1rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "32px",
          marginBottom: "0.5rem",
        }}
        aria-hidden="true"
      >
        ⚠
      </div>
      <div
        style={{
          fontSize: "15px",
          color: "var(--color-text-primary)",
          fontWeight: 500,
        }}
      >
        File not found
      </div>
      <div
        data-testid={`missing-path-${tileId}`}
        style={{
          fontSize: "13px",
          color: "var(--color-text-secondary)",
          fontFamily: "var(--font-editor)",
          wordBreak: "break-all",
          maxWidth: "400px",
        }}
      >
        {missingPath}
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "1rem",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          data-testid={`missing-locate-${tileId}`}
          onClick={onLocate}
          style={actionBtnStyle("var(--color-accent)")}
          title={`Open file picker scoped to ${dirHint}/`}
        >
          Locate…
        </button>
        <button
          data-testid={`missing-open-different-${tileId}`}
          onClick={onOpenDifferent}
          style={actionBtnStyle("var(--color-text-secondary)")}
        >
          Open a different buffer
        </button>
        <button
          data-testid={`missing-close-${tileId}`}
          onClick={onClose}
          style={actionBtnStyle("var(--color-error)")}
        >
          Close tile
        </button>
      </div>
    </div>
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    padding: "6px 16px",
    background: "transparent",
    border: `1px solid ${color}`,
    borderRadius: "6px",
    color,
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--font-prose)",
  };
}

function deriveDirectoryScope(missingPath: string): string {
  if (missingPath.includes("/notes/")) return "notes";
  if (missingPath.includes("/references/")) return "references";
  if (missingPath.includes("/ai-context/")) return "ai-context";
  return "notes";
}
