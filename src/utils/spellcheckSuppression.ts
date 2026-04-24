// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

const NO_SPELLCHECK = Decoration.mark({
  attributes: { spellcheck: "false" },
});

const SUPPRESS_NODES = new Set([
  "FencedCode",
  "CodeBlock",
  "CodeText",
  "InlineCode",
  "HTMLBlock",
  "HTMLTag",
]);

const MATH_RE = /(\${1,2})((?:\\.|(?!\1).)+?)\1/g;

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  const ranges: Array<{ from: number; to: number }> = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (SUPPRESS_NODES.has(node.name)) {
          ranges.push({ from: node.from, to: node.to });
        }
      },
    });

    const text = view.state.doc.sliceString(from, to);
    MATH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MATH_RE.exec(text)) !== null) {
      ranges.push({ from: from + m.index, to: from + m.index + m[0].length });
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.from < lastEnd) continue;
    if (r.from >= r.to) continue;
    builder.add(r.from, r.to, NO_SPELLCHECK);
    lastEnd = r.to;
  }
  return builder.finish();
}

export const spellcheckSuppression = ViewPlugin.fromClass(
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
