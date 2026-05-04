// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Round-trip fixture corpus: md → markdownToProseMirror → PM Node →
 * proseMirrorToMarkdown → should equal the canonical form of md.
 *
 * "Canonical form" means the output the serializer itself produces —
 * inputs are written in that form so the test asserts idempotency:
 *   roundtrip(md) === md  (first pass)
 *   roundtrip(roundtrip(md)) === roundtrip(md)  (stable)
 */

import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import type { Node as PMNode } from "@tiptap/pm/model";
import { markdownToProseMirror } from "../../src/editor/markdownToProseMirror";
import { proseMirrorToMarkdown } from "../../src/editor/proseMirrorToMarkdown";

// Full schema matching all node/mark types that markdownToProseMirror emits
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "inline*",
      group: "block",
      toDOM() { return ["p", 0] as unknown as [string, number]; },
    },
    text: { group: "inline" },
    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block",
      toDOM(node) {
        return [`h${node.attrs.level as number}`, 0] as unknown as [string, number];
      },
    },
    horizontalRule: {
      group: "block",
      toDOM() { return ["hr"] as unknown as [string]; },
    },
    codeBlock: {
      attrs: { language: { default: null } },
      content: "text*",
      group: "block",
      code: true,
      toDOM() { return ["pre", ["code", 0]] as unknown as [string, [string, number]]; },
    },
    mathDisplay: {
      attrs: { latex: { default: "" } },
      group: "block",
      atom: true,
      toDOM() { return ["div", { "data-type": "math-display" }] as unknown as [string, Record<string, string>]; },
    },
    mathInline: {
      attrs: { latex: { default: "" } },
      group: "inline",
      inline: true,
      atom: true,
      toDOM() { return ["span", { "data-type": "math-inline" }] as unknown as [string, Record<string, string>]; },
    },
    mermaidBlock: {
      attrs: { code: { default: "" } },
      group: "block",
      atom: true,
      toDOM() { return ["div", { "data-type": "mermaid" }] as unknown as [string, Record<string, string>]; },
    },
    drawingBlock: {
      attrs: { filename: { default: "" } },
      group: "block",
      atom: true,
      toDOM() { return ["div", { "data-type": "drawing" }] as unknown as [string, Record<string, string>]; },
    },
    hardBreak: {
      group: "inline",
      inline: true,
      selectable: false,
      toDOM() { return ["br"] as unknown as [string]; },
    },
    bulletList: {
      group: "block",
      content: "listItem+",
      toDOM() { return ["ul", 0] as unknown as [string, number]; },
    },
    orderedList: {
      attrs: { start: { default: 1 } },
      group: "block",
      content: "listItem+",
      toDOM() { return ["ol", 0] as unknown as [string, number]; },
    },
    listItem: {
      content: "paragraph block*",
      toDOM() { return ["li", 0] as unknown as [string, number]; },
    },
    taskList: {
      group: "block",
      content: "taskItem+",
      toDOM() { return ["ul", 0] as unknown as [string, number]; },
    },
    taskItem: {
      attrs: { checked: { default: false } },
      content: "paragraph block*",
      toDOM() { return ["li", 0] as unknown as [string, number]; },
    },
    blockquote: {
      content: "block+",
      group: "block",
      toDOM() { return ["blockquote", 0] as unknown as [string, number]; },
    },
  },
  marks: {
    bold: {
      toDOM() { return ["strong"] as unknown as [string]; },
    },
    italic: {
      toDOM() { return ["em"] as unknown as [string]; },
    },
    code: {
      toDOM() { return ["code"] as unknown as [string]; },
    },
    strike: {
      toDOM() { return ["s"] as unknown as [string]; },
    },
    link: {
      attrs: { href: {}, title: { default: null }, target: { default: null } },
      toDOM() { return ["a"] as unknown as [string]; },
    },
    underline: {
      toDOM() { return ["u"] as unknown as [string]; },
    },
  },
});

function roundtrip(md: string): string {
  const pmJSON = markdownToProseMirror(md);
  const doc = schema.nodeFromJSON(pmJSON) as PMNode;
  return proseMirrorToMarkdown(doc);
}

/** Assert roundtrip(md) === expected and is idempotent. */
function assertRoundtrip(md: string, expected?: string) {
  const once = roundtrip(md);
  const canonical = expected ?? md;
  expect(once.trim()).toBe(canonical.trim());
  // Idempotency: a second pass must not change the output
  expect(roundtrip(once).trim()).toBe(once.trim());
}

describe("tiptapBridge roundtrip", () => {
  it("heading h1", () => {
    assertRoundtrip("# Top-level heading");
  });

  it("heading h2", () => {
    assertRoundtrip("## Section heading");
  });

  it("heading h3", () => {
    assertRoundtrip("### Subsection");
  });

  it("bold text", () => {
    assertRoundtrip("**bold text**");
  });

  it("italic text", () => {
    // Canonical form uses _ (our serializer choice for round-trip stability)
    assertRoundtrip("_italic text_");
  });

  it("inline code", () => {
    assertRoundtrip("`code snippet`");
  });

  it("strikethrough", () => {
    assertRoundtrip("~~struck~~");
  });

  it("bullet list", () => {
    assertRoundtrip("* Alpha\n* Beta\n* Gamma");
  });

  it("ordered list", () => {
    assertRoundtrip("1. First\n2. Second\n3. Third");
  });

  it("task list — unchecked and checked", () => {
    assertRoundtrip("- [ ] Pending task\n- [x] Done task");
  });

  it("blockquote", () => {
    assertRoundtrip("> A wise observation.");
  });

  it("fenced code block with language", () => {
    assertRoundtrip("```typescript\nconst x = 42;\n```");
  });

  it("fenced code block without language", () => {
    assertRoundtrip("```\nplain code\n```");
  });

  it("KaTeX inline math", () => {
    assertRoundtrip("The formula $E=mc^2$ is famous.");
  });

  it("KaTeX display math", () => {
    assertRoundtrip("$$\nE=mc^2\n$$");
  });

  it("mermaid block", () => {
    assertRoundtrip("```mermaid\ngraph TD\n  A --> B\n```");
  });

  it("drawing block", () => {
    assertRoundtrip("```drawing\nnote.0001.drawing\n```");
  });

  it("horizontal rule", () => {
    assertRoundtrip("---");
  });

  it("link", () => {
    assertRoundtrip("[Example](https://example.com)");
  });

  it("mixed bold and italic in paragraph", () => {
    // *italic* from source → _italic_ in canonical form (serializer uses _)
    assertRoundtrip("**bold** and _italic_ together.");
  });

  it("nested: blockquote containing heading", () => {
    // remark puts heading inside blockquote as plain paragraph; verify no crash
    const md = "> ## Heading inside quote";
    const once = roundtrip(md);
    expect(once.trim()).toBeTruthy();
    expect(roundtrip(once).trim()).toBe(once.trim());
  });

  it("frontmatter: body-only content round-trips (bridge strips frontmatter before parsing)", () => {
    // Front-matter is handled by splitFrontmatter in tiptapBridge before body
    // reaches markdownToProseMirror; test body-only content here.
    const body = "## Note Title\n\nSome content with **bold** text.";
    const once = roundtrip(body);
    expect(once.trim()).toContain("## Note Title");
    expect(once.trim()).toContain("**bold**");
    expect(roundtrip(once).trim()).toBe(once.trim());
  });
});
