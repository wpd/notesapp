// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useEffect, useRef, useState, useCallback } from "react";
import useEditorStore from "../stores/editorStore";
import useLayoutStore from "../stores/layoutStore";
import { renderMarkdown } from "../utils/markdownPipeline";
import { renderMermaidBlocks } from "../utils/mermaidRenderer";
import { invoke } from "@tauri-apps/api/core";

interface PreviewPaneProps {
  tileId: string;
  filePath: string | null;
}

export default function PreviewPane({
  tileId,
  filePath,
}: PreviewPaneProps): React.ReactElement {
  const { ydocs, getOrCreateYDoc } = useEditorStore();
  const { focusTile } = useLayoutStore();

  const [html, setHtml] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load file into Y.Doc if needed (same as EditorPane — shared Y.Doc)
  useEffect(() => {
    if (!filePath) return;
    const ydoc = getOrCreateYDoc(filePath);
    const ytext = ydoc.getText("content");

    if (ytext.length === 0) {
      invoke<string>("read_note", { path: filePath })
        .then((content) => {
          if (ytext.length === 0) {
            ydoc.transact(() => {
              ytext.insert(0, content);
            });
          }
        })
        .catch(() => {
          // File may be missing — will show empty
        });
    }
  }, [filePath, getOrCreateYDoc]);

  const renderContent = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const rendered = await renderMarkdown(text);
      setHtml(rendered);
    }, 150);
  }, []);

  // Subscribe to Y.Text changes for the bound file
  useEffect(() => {
    if (!filePath) {
      setHtml("");
      return;
    }

    const ydoc = ydocs[filePath];
    if (!ydoc) {
      setHtml("");
      return;
    }

    const ytext = ydoc.getText("content");
    renderContent(ytext.toString());

    const onChange = () => {
      renderContent(ytext.toString());
    };

    ytext.observe(onChange);
    return () => {
      ytext.unobserve(onChange);
    };
  }, [filePath, ydocs, renderContent]);

  // Re-render if ydocs map changes (new Y.Doc loaded)
  useEffect(() => {
    if (!filePath) return;
    const ydoc = ydocs[filePath];
    if (!ydoc) return;
    const ytext = ydoc.getText("content");
    renderContent(ytext.toString());
  }, [ydocs, filePath, renderContent]);

  // After React commits the new HTML, render Mermaid code blocks as SVG.
  useEffect(() => {
    if (!contentRef.current || !html) return;
    const el = contentRef.current;
    void renderMermaidBlocks(el);
  }, [html]);

  // Best-effort scroll-sync with Editor cursor
  const cursorLine = useEditorStore((s) =>
    filePath ? s.cursorLines[filePath] : undefined,
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
      {filePath ? (
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
          <p>No note bound to this tile.</p>
          <p style={{ fontSize: "12px", marginTop: "0.5rem" }}>
            Open a file with <kbd>C-x b</kbd> or the ▾ dropdown
          </p>
        </div>
      )}
    </div>
  );
}
