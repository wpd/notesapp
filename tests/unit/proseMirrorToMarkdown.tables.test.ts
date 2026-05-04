// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * GFM table serialization round-trip tests.
 *
 * Verifies that markdownToProseMirror → PM Node → proseMirrorToMarkdown
 * produces canonical GFM table output and is idempotent.
 */

import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import type { Node as PMNode } from "@tiptap/pm/model";
import { markdownToProseMirror } from "../../src/editor/markdownToProseMirror";
import { proseMirrorToMarkdown } from "../../src/editor/proseMirrorToMarkdown";

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
    table: {
      content: "tableRow+",
      group: "block",
      toDOM() { return ["table", 0] as unknown as [string, number]; },
    },
    tableRow: {
      content: "(tableCell | tableHeader)+",
      toDOM() { return ["tr", 0] as unknown as [string, number]; },
    },
    tableHeader: {
      attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null } },
      content: "block+",
      toDOM() { return ["th", 0] as unknown as [string, number]; },
    },
    tableCell: {
      attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null } },
      content: "block+",
      toDOM() { return ["td", 0] as unknown as [string, number]; },
    },
  },
  marks: {
    bold: { toDOM() { return ["strong"] as unknown as [string]; } },
    italic: { toDOM() { return ["em"] as unknown as [string]; } },
    code: { toDOM() { return ["code"] as unknown as [string]; } },
    strike: { toDOM() { return ["s"] as unknown as [string]; } },
    link: {
      attrs: { href: {}, title: { default: null }, target: { default: null } },
      toDOM() { return ["a"] as unknown as [string]; },
    },
    underline: { toDOM() { return ["u"] as unknown as [string]; } },
  },
});

function roundtrip(md: string): string {
  const pmJSON = markdownToProseMirror(md);
  const doc = schema.nodeFromJSON(pmJSON) as PMNode;
  return proseMirrorToMarkdown(doc);
}

describe("proseMirrorToMarkdown — GFM tables", () => {
  it("serializes a 2-column table with header", () => {
    const md = "| Name | Value |\n| --- | --- |\n| Foo | 42 |";
    const once = roundtrip(md);
    expect(once).toContain("| Name | Value |");
    expect(once).toContain("| --- | --- |");
    expect(once).toContain("| Foo | 42 |");
  });

  it("table round-trip is idempotent", () => {
    const md = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";
    const once = roundtrip(md);
    expect(roundtrip(once).trim()).toBe(once.trim());
  });

  it("table with 3 body rows", () => {
    const md = "| Col1 | Col2 |\n| --- | --- |\n| r1c1 | r1c2 |\n| r2c1 | r2c2 |\n| r3c1 | r3c2 |";
    const once = roundtrip(md);
    expect(once).toContain("| r1c1 | r1c2 |");
    expect(once).toContain("| r2c1 | r2c2 |");
    expect(once).toContain("| r3c1 | r3c2 |");
  });

  it("table surrounded by other blocks stays separated", () => {
    const md = "Intro paragraph.\n\n| H1 | H2 |\n| --- | --- |\n| a | b |\n\nTrailing paragraph.";
    const once = roundtrip(md);
    expect(once).toContain("Intro paragraph.");
    expect(once).toContain("| H1 | H2 |");
    expect(once).toContain("Trailing paragraph.");
  });

  it("pipe characters inside cell content are escaped", () => {
    // remark-gfm parses escaped pipes in cells
    const md = "| A | B |\n| --- | --- |\n| x\\|y | z |";
    const once = roundtrip(md);
    // The serializer re-escapes the pipe; content should survive round-trip
    expect(once).toContain("x\\|y");
    expect(roundtrip(once).trim()).toBe(once.trim());
  });
});
