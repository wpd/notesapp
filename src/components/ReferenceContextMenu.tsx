// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Context menu shown on text selection in a Reference tile.
 *
 * "Copy" — formats selected text as a markdown blockquote with a citation
 *           footer and writes it to the clipboard.
 * "Highlight" — persists a highlight annotation to the PDF sidecar file
 *               (`.pdf.annotations`). Visual rendering deferred to Phase 7
 *               per ROADMAP.md Phase 3 substitutions.
 */

import React, { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SelectionInfo {
  text: string;
  /** Reference file name (e.g. "paper.pdf") shown in the citation. */
  filename: string;
  /** Absolute path to the file, used for sidecar writes. */
  filePath: string;
  /** Page number for PDFs (1-based); undefined for markdown. */
  page?: number;
}

interface ReferenceContextMenuProps {
  x: number;
  y: number;
  selection: SelectionInfo;
  onClose: () => void;
}

export default function ReferenceContextMenu({
  x,
  y,
  selection,
  onClose,
}: ReferenceContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const isPdf = selection.filePath.toLowerCase().endsWith(".pdf");

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const handleCopy = async () => {
    const citation = selection.page != null
      ? `${selection.filename} (p. ${selection.page})`
      : selection.filename;
    const blockquote = `> ${selection.text.replace(/\n/g, "\n> ")}\n>\n> — ${citation}`;
    try {
      await navigator.clipboard.writeText(blockquote);
    } catch {
      // Fallback — no-op if clipboard is unavailable (rare in Tauri)
    }
    onClose();
  };

  const handleHighlight = async () => {
    if (!isPdf) {
      onClose();
      return;
    }
    try {
      const existing = await invoke<string>("read_pdf_annotations", {
        pdfPath: selection.filePath,
      });
      let annotations: unknown[] = [];
      try {
        annotations = JSON.parse(existing) as unknown[];
      } catch {
        annotations = [];
      }
      annotations.push({
        id: `h-${Date.now()}`,
        text: selection.text,
        page: selection.page ?? 1,
        createdAt: new Date().toISOString(),
      });
      await invoke("write_pdf_annotations", {
        pdfPath: selection.filePath,
        content: JSON.stringify(annotations),
      });
    } catch {
      // Non-fatal
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      data-testid="reference-context-menu"
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--color-bg-overlay)",
        border: "1px solid var(--color-border)",
        borderRadius: "6px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        zIndex: 2000,
        minWidth: "140px",
        overflow: "hidden",
        fontFamily: "var(--font-prose)",
        fontSize: "13px",
      }}
    >
      <button
        data-testid="reference-context-copy"
        onClick={() => void handleCopy()}
        style={menuItemStyle}
      >
        Copy
      </button>
      {isPdf && (
        <button
          data-testid="reference-context-highlight"
          onClick={() => void handleHighlight()}
          style={menuItemStyle}
        >
          Highlight
        </button>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 14px",
  background: "transparent",
  border: "none",
  textAlign: "left",
  cursor: "pointer",
  color: "var(--color-text-primary)",
  fontFamily: "var(--font-prose)",
  fontSize: "13px",
};
