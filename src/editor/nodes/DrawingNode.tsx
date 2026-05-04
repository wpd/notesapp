// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

// Phase 2 M1 placeholder — full Excalidraw canvas lands in M4.

import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";

function DrawingNodeView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-testid="drawing-placeholder"
      style={{
        border: "2px dashed var(--color-border)",
        borderRadius: "6px",
        padding: "2rem",
        margin: "1em 0",
        textAlign: "center",
        color: "var(--color-text-disabled)",
        fontFamily: "var(--font-prose)",
        fontSize: "14px",
        background: "var(--color-bg-secondary)",
      }}
    >
      ✏️ Drawing: <code>{node.attrs.filename as string}</code>
      <div style={{ fontSize: "12px", marginTop: "0.5rem" }}>
        (Excalidraw canvas — coming in Phase 2 M4)
      </div>
    </NodeViewWrapper>
  );
}

export const DrawingBlock = Node.create({
  name: "drawingBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return { filename: { default: "" } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="drawing"]' }];
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-type": "drawing",
        "data-filename": node.attrs.filename as string,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingNodeView);
  },
});
