// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * ReferencePane — body of a Reference tile (SPEC.md §5.3).
 *
 * Branches on the bound file's extension:
 *   .pdf  → PdfReferenceView (PDF.js canvas + text layer)
 *   .md   → MarkdownReferenceView (read-only remark/rehype pipeline)
 *   other → inline error card ("file type not previewable")
 */

import React from "react";
import PdfReferenceView from "./PdfReferenceView";
import MarkdownReferenceView from "./MarkdownReferenceView";

interface ReferencePaneProps {
  tileId: string;
  filePath: string | null;
}

export default function ReferencePane({
  tileId,
  filePath,
}: ReferencePaneProps): React.ReactElement {
  if (!filePath) {
    return (
      <div
        data-testid={`reference-no-file-${tileId}`}
        style={placeholderStyle}
      >
        No reference document bound. Use the ▾ dropdown to open one.
      </div>
    );
  }

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    return <PdfReferenceView tileId={tileId} filePath={filePath} />;
  }

  if (ext === "md" || ext === "markdown" || ext === "txt") {
    return <MarkdownReferenceView filePath={filePath} />;
  }

  return (
    <div
      data-testid={`reference-unsupported-${tileId}`}
      style={placeholderStyle}
    >
      This file type ({ext ? `.${ext}` : "unknown"}) is not previewable
      in the Reference tile. Open it externally to view its contents.
    </div>
  );
}

const placeholderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  fontFamily: "var(--font-prose)",
  fontSize: "14px",
  color: "var(--color-text-disabled)",
  padding: "2rem",
  textAlign: "center",
};
