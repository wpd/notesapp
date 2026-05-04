// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { useEffect, useRef } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import mermaid from "mermaid";

let mermaidInitialized = false;
function ensureMermaid() {
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, theme: "neutral" });
    mermaidInitialized = true;
  }
}

let mermaidIdCounter = 0;

function MermaidNodeView({ node }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string>(`mermaid-wysiwyg-${++mermaidIdCounter}`);

  useEffect(() => {
    if (!ref.current) return;
    ensureMermaid();
    const code = node.attrs.code as string;
    const id = idRef.current;
    ref.current.innerHTML = "";

    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => {
        if (ref.current) {
          ref.current.textContent = `[Mermaid parse error in diagram]`;
        }
      });
  }, [node.attrs.code]);

  return (
    <NodeViewWrapper contentEditable={false} style={{ margin: "1em 0" }}>
      <div ref={ref} className="mermaid-container" />
    </NodeViewWrapper>
  );
}

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return { code: { default: "" } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ node }) {
    return [
      "div",
      { "data-type": "mermaid", "data-code": node.attrs.code as string },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});
