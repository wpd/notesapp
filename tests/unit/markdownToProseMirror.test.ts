// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect } from "vitest";
import { markdownToProseMirror } from "../../src/editor/markdownToProseMirror";

describe("markdownToProseMirror", () => {
  it("produces a doc node at the root", () => {
    const result = markdownToProseMirror("Hello");
    expect(result.type).toBe("doc");
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("converts a simple paragraph", () => {
    const result = markdownToProseMirror("Hello world");
    expect(result.content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Hello world" }],
    });
  });

  it("converts headings with correct levels", () => {
    const result = markdownToProseMirror("# H1\n\n## H2\n\n### H3");
    expect(result.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(result.content?.[1]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(result.content?.[2]).toMatchObject({ type: "heading", attrs: { level: 3 } });
  });

  it("converts bold text to text node with bold mark", () => {
    const result = markdownToProseMirror("**bold**");
    const para = result.content?.[0];
    expect(para?.type).toBe("paragraph");
    expect(para?.content?.[0]).toMatchObject({
      type: "text",
      text: "bold",
      marks: [{ type: "bold" }],
    });
  });

  it("converts italic text", () => {
    const result = markdownToProseMirror("_italic_");
    expect(result.content?.[0]?.content?.[0]).toMatchObject({
      type: "text",
      text: "italic",
      marks: [{ type: "italic" }],
    });
  });

  it("converts inline code", () => {
    const result = markdownToProseMirror("`code`");
    expect(result.content?.[0]?.content?.[0]).toMatchObject({
      type: "text",
      text: "code",
      marks: [{ type: "code" }],
    });
  });

  it("converts a fenced code block with language", () => {
    const result = markdownToProseMirror("```typescript\nconst x = 1;\n```");
    expect(result.content?.[0]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "typescript" },
    });
  });

  it("converts a mermaid fenced block to mermaidBlock node", () => {
    const result = markdownToProseMirror("```mermaid\ngraph TD\n  A --> B\n```");
    expect(result.content?.[0]).toMatchObject({
      type: "mermaidBlock",
      attrs: { code: "graph TD\n  A --> B" },
    });
  });

  it("converts a drawing fenced block to drawingBlock node", () => {
    const result = markdownToProseMirror("```drawing\nnote.0001.drawing\n```");
    expect(result.content?.[0]).toMatchObject({
      type: "drawingBlock",
      attrs: { filename: "note.0001.drawing" },
    });
  });

  it("converts inline math to mathInline node", () => {
    const result = markdownToProseMirror("The equation $E=mc^2$ is famous.");
    const para = result.content?.[0];
    expect(para?.type).toBe("paragraph");
    const mathNode = para?.content?.find((n) => n.type === "mathInline");
    expect(mathNode).toMatchObject({ type: "mathInline", attrs: { latex: "E=mc^2" } });
  });

  it("converts display math to mathDisplay node", () => {
    const result = markdownToProseMirror("$$\n\\int_0^\\infty e^{-x} dx\n$$");
    expect(result.content?.[0]).toMatchObject({
      type: "mathDisplay",
      attrs: { latex: "\\int_0^\\infty e^{-x} dx" },
    });
  });

  it("converts blockquote", () => {
    const result = markdownToProseMirror("> Quoted text");
    expect(result.content?.[0]).toMatchObject({ type: "blockquote" });
    const inner = result.content?.[0]?.content?.[0];
    expect(inner?.type).toBe("paragraph");
  });

  it("converts unordered list", () => {
    const result = markdownToProseMirror("- Item A\n- Item B");
    expect(result.content?.[0]).toMatchObject({ type: "bulletList" });
    expect(result.content?.[0]?.content).toHaveLength(2);
    expect(result.content?.[0]?.content?.[0]?.type).toBe("listItem");
  });

  it("converts ordered list", () => {
    const result = markdownToProseMirror("1. First\n2. Second");
    expect(result.content?.[0]).toMatchObject({ type: "orderedList" });
    expect(result.content?.[0]?.content?.[0]?.type).toBe("listItem");
  });

  it("converts GFM task list", () => {
    const result = markdownToProseMirror("- [x] Done\n- [ ] Todo");
    const list = result.content?.[0];
    expect(list?.type).toBe("taskList");
    expect(list?.content?.[0]).toMatchObject({ type: "taskItem", attrs: { checked: true } });
    expect(list?.content?.[1]).toMatchObject({ type: "taskItem", attrs: { checked: false } });
  });

  it("converts thematic break to horizontalRule", () => {
    const result = markdownToProseMirror("---");
    expect(result.content?.[0]).toMatchObject({ type: "horizontalRule" });
  });

  it("returns a valid doc with empty paragraph for empty input", () => {
    const result = markdownToProseMirror("");
    expect(result.type).toBe("doc");
    expect(result.content).toHaveLength(1);
    expect(result.content?.[0]?.type).toBe("paragraph");
  });

  it("converts GFM strikethrough to strike mark", () => {
    const result = markdownToProseMirror("~~deleted~~");
    expect(result.content?.[0]?.content?.[0]).toMatchObject({
      type: "text",
      text: "deleted",
      marks: [{ type: "strike" }],
    });
  });

  it("converts a link", () => {
    const result = markdownToProseMirror("[Example](https://example.com)");
    const linkNode = result.content?.[0]?.content?.[0];
    expect(linkNode).toMatchObject({
      type: "text",
      marks: [{ type: "link", attrs: { href: "https://example.com" } }],
    });
  });

  it("preserves mixed inline marks (nested bold+italic)", () => {
    const result = markdownToProseMirror("**_bold-italic_**");
    const nodes = result.content?.[0]?.content ?? [];
    const mixed = nodes.find((n) => n.marks && n.marks.length === 2);
    expect(mixed).toBeDefined();
    const markTypes = mixed!.marks!.map((m) => m.type);
    expect(markTypes).toContain("bold");
    expect(markTypes).toContain("italic");
  });
});
