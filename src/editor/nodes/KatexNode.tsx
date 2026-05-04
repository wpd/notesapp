// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { useEffect, useRef } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import katex from "katex";
import "katex/dist/katex.min.css";

// ── Inline math node ($...$) ────────────────────────────────────────────────

function KatexInlineView({ node }: NodeViewProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(node.attrs.latex as string, ref.current, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      if (ref.current) ref.current.textContent = node.attrs.latex as string;
    }
  }, [node.attrs.latex]);
  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      <span ref={ref} />
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return { latex: { default: "" } };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ node }) {
    return [
      "span",
      { "data-type": "math-inline", "data-latex": node.attrs.latex as string },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KatexInlineView);
  },
});

// ── Display math node ($$...$$) ─────────────────────────────────────────────

function KatexDisplayView({ node }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(node.attrs.latex as string, ref.current, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      if (ref.current) ref.current.textContent = node.attrs.latex as string;
    }
  }, [node.attrs.latex]);
  return (
    <NodeViewWrapper contentEditable={false} style={{ textAlign: "center", margin: "1em 0" }}>
      <div ref={ref} />
    </NodeViewWrapper>
  );
}

export const MathDisplay = Node.create({
  name: "mathDisplay",
  group: "block",
  atom: true,

  addAttributes() {
    return { latex: { default: "" } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-display"]' }];
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "math-display",
        "data-latex": node.attrs.latex as string,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KatexDisplayView);
  },
});
