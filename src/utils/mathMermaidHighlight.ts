// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Editor decorations that give LaTeX inline (`$...$`), LaTeX display
 * (`$$...$$`), and Mermaid fenced blocks distinct CSS classes so the
 * theme can style them as distinct token types (ROADMAP §Phase 1
 * "Editor Tile" requirements).
 *
 * Inline LaTeX  → .cm-math-inline
 * Display LaTeX → .cm-math-display
 * Mermaid block → .cm-mermaid-block
 */

import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

const INLINE_MATH = Decoration.mark({ class: "cm-math-inline" });
const DISPLAY_MATH = Decoration.mark({ class: "cm-math-display" });
const MERMAID_BLOCK = Decoration.mark({ class: "cm-mermaid-block" });

const DISPLAY_RE = /\$\$([\s\S]+?)\$\$/g;
const INLINE_RE = /(?<!\$)\$(?!\$)((?:\\.|[^$\\\n])+?)\$(?!\$)/g;

interface Range {
  from: number;
  to: number;
  deco: Decoration;
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "FencedCode") return;
        const text = view.state.doc.sliceString(node.from, node.to);
        const firstLine = text.split("\n", 1)[0];
        if (/^```\s*mermaid\b/i.test(firstLine)) {
          ranges.push({ from: node.from, to: node.to, deco: MERMAID_BLOCK });
        }
      },
    });

    const text = view.state.doc.sliceString(from, to);

    DISPLAY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DISPLAY_RE.exec(text)) !== null) {
      ranges.push({
        from: from + m.index,
        to: from + m.index + m[0].length,
        deco: DISPLAY_MATH,
      });
    }

    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text)) !== null) {
      const start = from + m.index;
      const end = start + m[0].length;
      const overlapsDisplay = ranges.some(
        (r) => r.deco === DISPLAY_MATH && start < r.to && end > r.from,
      );
      if (!overlapsDisplay) {
        ranges.push({ from: start, to: end, deco: INLINE_MATH });
      }
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.from < lastEnd) continue;
    if (r.from >= r.to) continue;
    builder.add(r.from, r.to, r.deco);
    lastEnd = r.to;
  }
  return builder.finish();
}

export const mathMermaidHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
