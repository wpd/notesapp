// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, afterEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { mathMermaidHighlight } from "../../src/utils/mathMermaidHighlight";

function makeView(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage }), mathMermaidHighlight],
  });
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

function decorationsFor(view: EditorView): Array<{
  from: number;
  to: number;
  cls: string;
}> {
  const out: Array<{ from: number; to: number; cls: string }> = [];
  const plugin = (view as unknown as {
    plugin: (p: typeof mathMermaidHighlight) => { decorations: { iter(): { value: { spec: { class: string } } | null; from: number; to: number; next(): void } } | null };
  }).plugin(mathMermaidHighlight);
  if (!plugin) return out;
  const set = plugin.decorations;
  if (!set) return out;
  const iter = set.iter();
  while (iter.value) {
    out.push({ from: iter.from, to: iter.to, cls: iter.value.spec.class });
    iter.next();
  }
  return out;
}

describe("mathMermaidHighlight (ROADMAP §Phase 1)", () => {
  let view: EditorView;
  afterEach(() => {
    if (view) {
      view.destroy();
      view.dom.parentElement?.remove();
    }
  });

  it("marks inline LaTeX with .cm-math-inline", () => {
    view = makeView("Pythagoras: $a^2 + b^2 = c^2$ holds.\n");
    const decos = decorationsFor(view);
    const inline = decos.find((d) => d.cls === "cm-math-inline");
    expect(inline).toBeDefined();
    expect(view.state.doc.sliceString(inline!.from, inline!.to)).toBe(
      "$a^2 + b^2 = c^2$",
    );
  });

  it("marks display LaTeX with .cm-math-display", () => {
    view = makeView("Block:\n$$E = mc^2$$\nafter\n");
    const decos = decorationsFor(view);
    const display = decos.find((d) => d.cls === "cm-math-display");
    expect(display).toBeDefined();
    expect(view.state.doc.sliceString(display!.from, display!.to)).toBe(
      "$$E = mc^2$$",
    );
  });

  it("does not mark inline LaTeX inside a display block", () => {
    view = makeView("$$a$ inside $b$$\n");
    const decos = decorationsFor(view);
    const inlines = decos.filter((d) => d.cls === "cm-math-inline");
    expect(inlines.length).toBe(0);
    expect(decos.some((d) => d.cls === "cm-math-display")).toBe(true);
  });

  it("marks fenced mermaid blocks with .cm-mermaid-block", () => {
    view = makeView("```mermaid\ngraph TD;\nA-->B;\n```\n");
    const decos = decorationsFor(view);
    const mermaid = decos.find((d) => d.cls === "cm-mermaid-block");
    expect(mermaid).toBeDefined();
  });

  it("does not mark fenced non-mermaid code blocks as mermaid", () => {
    view = makeView("```js\nconst x = 1;\n```\n");
    const decos = decorationsFor(view);
    expect(decos.some((d) => d.cls === "cm-mermaid-block")).toBe(false);
  });

  it("uses different classes for inline vs display LaTeX", () => {
    view = makeView("inline $x$ then\n$$y$$\n");
    const decos = decorationsFor(view);
    const classes = new Set(decos.map((d) => d.cls));
    expect(classes.has("cm-math-inline")).toBe(true);
    expect(classes.has("cm-math-display")).toBe(true);
  });
});
