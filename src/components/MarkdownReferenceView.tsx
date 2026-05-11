// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Read-only rendered view for markdown reference documents (SPEC.md §5.3).
 *
 * Reuses the same remark/rehype/KaTeX/Mermaid pipeline as the Preview tile.
 * YAML front-matter is stripped from the rendered output (same rule as Preview).
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { renderMarkdown } from "../utils/markdownPipeline";
import { renderMermaidBlocks } from "../utils/mermaidRenderer";
import "katex/dist/katex.min.css";
import ReferenceContextMenu, { SelectionInfo } from "./ReferenceContextMenu";

interface MarkdownReferenceViewProps {
  filePath: string;
}

export default function MarkdownReferenceView({
  filePath,
}: MarkdownReferenceViewProps): React.ReactElement {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selection: SelectionInfo;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    invoke<string>("read_reference", { path: filePath })
      .then((content) => renderMarkdown(content))
      .then((rendered) => {
        if (!active) return;
        setHtml(rendered);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  // Render Mermaid blocks after HTML is injected into the DOM
  useEffect(() => {
    if (!containerRef.current || !html) return;
    renderMermaidBlocks(containerRef.current);
  }, [html]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const text = window.getSelection()?.toString().trim() ?? "";
      if (!text) return;
      e.preventDefault();
      const filename = filePath.split("/").pop() ?? filePath;
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selection: { text, filename, filePath },
      });
    },
    [filePath],
  );

  if (loading) {
    return (
      <div
        data-testid="md-reference-loading"
        style={{
          padding: "2rem",
          color: "var(--color-text-disabled)",
          fontFamily: "var(--font-prose)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="md-reference-error"
        style={{
          padding: "2rem",
          color: "var(--color-error, #dc2626)",
          fontFamily: "var(--font-prose)",
        }}
      >
        [Error loading reference: {error}]
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        data-testid="md-reference-view"
        onContextMenu={handleContextMenu}
        style={{
          padding: "1.5rem 2rem",
          fontFamily: "var(--font-prose)",
          fontSize: "15px",
          lineHeight: 1.7,
          color: "var(--color-text-primary)",
          overflowY: "auto",
          height: "100%",
        }}
        // Safe: content is rendered by our own unified pipeline,
        // not from arbitrary user-supplied URLs.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {contextMenu && (
        <ReferenceContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selection={contextMenu.selection}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
