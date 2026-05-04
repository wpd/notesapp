// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Tests for proseMirrorToMarkdown — the reverse bridge serializer.
 *
 * Strategy: build ProseMirror JSON manually (same format as markdownToProseMirror
 * produces) and verify the serialized markdown string matches expectations.
 */

import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import type { Node as PMNode } from "@tiptap/pm/model";
import { proseMirrorToMarkdown } from "../../src/editor/proseMirrorToMarkdown";

// Minimal schema compatible with the nodes/marks we serialize
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

function makeDoc(json: object): PMNode {
  return schema.nodeFromJSON({ type: "doc", content: [json] });
}

describe("proseMirrorToMarkdown", () => {
  it("serializes a paragraph", () => {
    const doc = makeDoc({ type: "paragraph", content: [{ type: "text", text: "Hello world" }] });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("Hello world");
  });

  it("serializes a heading", () => {
    const doc = makeDoc({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "My heading" }] });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("## My heading");
  });

  it("serializes bold text", () => {
    const doc = makeDoc({
      type: "paragraph",
      content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
    });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("**bold**");
  });

  it("serializes italic text", () => {
    const doc = makeDoc({
      type: "paragraph",
      content: [{ type: "text", text: "em", marks: [{ type: "italic" }] }],
    });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("_em_");
  });

  it("serializes strikethrough", () => {
    const doc = makeDoc({
      type: "paragraph",
      content: [{ type: "text", text: "del", marks: [{ type: "strike" }] }],
    });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("~~del~~");
  });

  it("serializes underline as <u>", () => {
    const doc = makeDoc({
      type: "paragraph",
      content: [{ type: "text", text: "u", marks: [{ type: "underline" }] }],
    });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("<u>u</u>");
  });

  it("serializes inline code", () => {
    const doc = makeDoc({
      type: "paragraph",
      content: [{ type: "text", text: "code", marks: [{ type: "code" }] }],
    });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("`code`");
  });

  it("serializes a link", () => {
    const doc = makeDoc({
      type: "paragraph",
      content: [
        { type: "text", text: "Example", marks: [{ type: "link", attrs: { href: "https://example.com", title: null, target: null } }] },
      ],
    });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("[Example](https://example.com)");
  });

  it("serializes a fenced code block with language", () => {
    const doc = makeDoc({
      type: "codeBlock",
      attrs: { language: "typescript" },
      content: [{ type: "text", text: "const x = 1;" }],
    });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("```typescript\nconst x = 1;\n```");
  });

  it("serializes a mathDisplay block", () => {
    const doc = makeDoc({ type: "mathDisplay", attrs: { latex: "E=mc^2" } });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("$$\nE=mc^2\n$$");
  });

  it("serializes a mathInline node", () => {
    const doc = makeDoc({
      type: "paragraph",
      content: [
        { type: "text", text: "The equation " },
        { type: "mathInline", attrs: { latex: "E=mc^2" } },
        { type: "text", text: " is famous." },
      ],
    });
    const md = proseMirrorToMarkdown(doc).trim();
    expect(md).toContain("$E=mc^2$");
  });

  it("serializes a mermaidBlock", () => {
    const doc = makeDoc({ type: "mermaidBlock", attrs: { code: "graph TD\n  A --> B" } });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("```mermaid\ngraph TD\n  A --> B\n```");
  });

  it("serializes a drawingBlock", () => {
    const doc = makeDoc({ type: "drawingBlock", attrs: { filename: "note.0001.drawing" } });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("```drawing\nnote.0001.drawing\n```");
  });

  it("serializes a blockquote", () => {
    const doc = makeDoc({
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted" }] }],
    });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("> Quoted");
  });

  it("serializes a bullet list", () => {
    const doc = makeDoc({
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item A" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item B" }] }] },
      ],
    });
    const md = proseMirrorToMarkdown(doc).trim();
    expect(md).toContain("* Item A");
    expect(md).toContain("* Item B");
  });

  it("serializes an ordered list", () => {
    const doc = makeDoc({
      type: "orderedList",
      attrs: { start: 1 },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] },
      ],
    });
    const md = proseMirrorToMarkdown(doc).trim();
    expect(md).toContain("1.");
    expect(md).toContain("First");
  });

  it("serializes a horizontal rule", () => {
    const doc = makeDoc({ type: "horizontalRule" });
    expect(proseMirrorToMarkdown(doc).trim()).toBe("---");
  });
});
