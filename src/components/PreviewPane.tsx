// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useEffect, useRef, useState, useCallback } from "react";
import useEditorStore from "../stores/editorStore";
import useLayoutStore from "../stores/layoutStore";
import { renderMarkdown } from "../utils/markdownPipeline";
import { renderMermaidBlocks } from "../utils/mermaidRenderer";

interface PreviewPaneProps {
  tileId: string;
  filePath: string | null;
}

/** Find the "active" file path to render: pinned editor → focused editor → first editor */
function useActiveFilePath(tileId: string): string | null {
  return useLayoutStore((state) => {
    const { pinnedTileId, tiles, focusedTileId } = state;

    // Prefer pinned
    if (pinnedTileId) {
      const pinned = tiles[pinnedTileId];
      if (pinned?.type === "editor" && pinned.filePath) {
        return pinned.filePath;
      }
    }

    // Then focused editor tile
    if (focusedTileId && focusedTileId !== tileId) {
      const focused = tiles[focusedTileId];
      if (focused?.type === "editor" && focused.filePath) {
        return focused.filePath;
      }
    }

    // The tile's own filePath
    const own = tiles[tileId];
    if (own?.filePath) return own.filePath;

    // First editor tile with a file
    for (const tile of Object.values(tiles)) {
      if (tile.type === "editor" && tile.filePath) return tile.filePath;
    }

    return null;
  });
}

export default function PreviewPane({
  tileId,
  filePath: _ownFilePath,
}: PreviewPaneProps): React.ReactElement {
  const activeFilePath = useActiveFilePath(tileId);
  const { ydocs } = useEditorStore();
  const { focusTile } = useLayoutStore();

  const [html, setHtml] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const renderContent = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const rendered = await renderMarkdown(text);
      setHtml(rendered);
    }, 150);
  }, []);

  // Subscribe to Y.Text changes for the active file
  useEffect(() => {
    if (!activeFilePath) {
      setHtml("");
      return;
    }

    const ydoc = ydocs[activeFilePath];
    if (!ydoc) {
      setHtml("");
      return;
    }

    const ytext = ydoc.getText("content");

    // Initial render
    renderContent(ytext.toString());

    const onChange = () => {
      renderContent(ytext.toString());
    };

    ytext.observe(onChange);
    return () => {
      ytext.unobserve(onChange);
    };
  }, [activeFilePath, ydocs, renderContent]);

  // Also re-render if ydocs changes (new Y.Doc loaded)
  useEffect(() => {
    if (!activeFilePath) return;
    const ydoc = ydocs[activeFilePath];
    if (!ydoc) return;
    const ytext = ydoc.getText("content");
    renderContent(ytext.toString());
  }, [ydocs, activeFilePath, renderContent]);

  // After React commits the new HTML, walk the DOM and render any Mermaid
  // code blocks as SVG diagrams.  A parse failure is rendered inline as
  // `[Mermaid parse error: …]` — never crash the pane.
  useEffect(() => {
    if (!contentRef.current || !html) return;
    const el = contentRef.current;
    void renderMermaidBlocks(el);
  }, [html]);

  // Best-effort scroll-sync: when the editor caret moves, scroll the preview
  // to the element whose source line is closest (but not past) the caret.
  // Uses `data-source-line` attributes attached by the rehypeAttachSourceLines
  // pipeline plugin.
  const cursorLine = useEditorStore((s) =>
    activeFilePath ? s.cursorLines[activeFilePath] : undefined,
  );
  useEffect(() => {
    if (!contentRef.current || cursorLine == null) return;
    const nodes = contentRef.current.querySelectorAll<HTMLElement>(
      "[data-source-line]",
    );
    if (nodes.length === 0) return;
    let best: HTMLElement | null = null;
    let bestLine = -1;
    for (const node of Array.from(nodes)) {
      const line = Number(node.getAttribute("data-source-line"));
      if (!Number.isFinite(line)) continue;
      if (line <= cursorLine && line > bestLine) {
        best = node;
        bestLine = line;
      }
    }
    if (best) {
      best.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [cursorLine, html]);

  return (
    <div
      data-testid={`preview-pane-${tileId}`}
      onClick={() => focusTile(tileId)}
      style={{
        height: "100%",
        overflow: "auto",
        background: "var(--color-bg-primary)",
        padding: "1rem 1.5rem",
        fontFamily: "var(--font-prose)",
        fontSize: "var(--font-size-prose-default)",
        color: "var(--color-text-primary)",
        lineHeight: "1.65",
        cursor: "default",
      }}
    >
      {activeFilePath ? (
        <div
          ref={contentRef}
          data-testid={`preview-content-${tileId}`}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by rehype pipeline
          dangerouslySetInnerHTML={{ __html: html }}
          className="prose-content"
        />
      ) : (
        <div
          data-testid={`preview-empty-${tileId}`}
          style={{
            color: "var(--color-text-disabled)",
            textAlign: "center",
            marginTop: "3rem",
          }}
        >
          <p>No note open in the editor.</p>
          <p style={{ fontSize: "12px", marginTop: "0.5rem" }}>
            Open a file with <kbd>C-x b</kbd> or <kbd>C-x C-f</kbd>
          </p>
        </div>
      )}
    </div>
  );
}
