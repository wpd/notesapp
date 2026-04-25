// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect } from "vitest";
import { renderMarkdown, renderMarkdownSync } from "../../src/utils/markdownPipeline";

describe("markdownPipeline", () => {
  describe("renderMarkdown (async)", () => {
    it("converts heading to <h1>", async () => {
      const html = await renderMarkdown("# Hello World");
      expect(html).toMatch(/<h1[\s>]/);
      expect(html).toContain("Hello World");
    });

    it("converts **bold** to <strong>", async () => {
      const html = await renderMarkdown("**bold text**");
      expect(html).toContain("<strong>");
      expect(html).toContain("bold text");
    });

    it("converts _italic_ to <em>", async () => {
      const html = await renderMarkdown("_italic text_");
      expect(html).toContain("<em>");
    });

    it("converts fenced code block", async () => {
      const html = await renderMarkdown("```\nconst x = 1;\n```");
      expect(html).toContain("<code>");
    });

    it("renders inline code", async () => {
      const html = await renderMarkdown("Use `console.log()` to debug.");
      expect(html).toContain("<code>");
    });

    it("renders a link", async () => {
      const html = await renderMarkdown("[NotesApp](https://example.com)");
      expect(html).toContain('<a');
      expect(html).toContain("NotesApp");
    });

    it("renders a blockquote", async () => {
      const html = await renderMarkdown("> This is a quote");
      expect(html).toMatch(/<blockquote[\s>]/);
    });

    it("renders an unordered list", async () => {
      const html = await renderMarkdown("- item one\n- item two");
      expect(html).toMatch(/<ul[\s>]/);
      expect(html).toContain("<li>");
    });
  });

  describe("KaTeX math rendering", () => {
    it("renders inline math $...$", async () => {
      const html = await renderMarkdown("The formula $E = mc^2$ is famous.");
      // KaTeX should produce either a span or katex-specific markup
      expect(html).toContain("katex");
    });

    it("renders display math $$...$$", async () => {
      const html = await renderMarkdown("$$\\int_0^1 x^2 dx = \\frac{1}{3}$$");
      expect(html).toContain("katex");
    });

    it("handles invalid LaTeX gracefully (no throw)", async () => {
      // throwOnError: false — should render an error element, not throw
      const html = await renderMarkdown("$\\invalidcommand$");
      // Should return some HTML (possibly with error class, but no crash)
      expect(typeof html).toBe("string");
    });
  });

  describe("renderMarkdownSync", () => {
    it("converts heading synchronously", () => {
      const html = renderMarkdownSync("## Hello");
      expect(html).toMatch(/<h2[\s>]/);
    });

    it("handles empty string", () => {
      const html = renderMarkdownSync("");
      expect(typeof html).toBe("string");
    });
  });

  describe("Scroll-sync metadata", () => {
    it("stamps block elements with data-source-line attributes", async () => {
      const md = "# Heading\n\nFirst paragraph.\n\nSecond paragraph.";
      const html = await renderMarkdown(md);
      // Heading starts at line 1
      expect(html).toMatch(/<h1[^>]*data-source-line="1"/);
      // First paragraph on line 3, second on line 5
      expect(html).toMatch(/data-source-line="3"/);
      expect(html).toMatch(/data-source-line="5"/);
    });
  });

  describe("Mermaid fenced blocks", () => {
    it("preserves the `language-mermaid` class so the runtime can transform it to SVG", async () => {
      const md = "```mermaid\ngraph TD; A-->B;\n```";
      const html = await renderMarkdown(md);
      expect(html).toContain("language-mermaid");
      // Source text survives so PreviewPane can hand it to mermaid.render()
      expect(html).toContain("graph TD");
    });
  });

  describe("GFM extensions", () => {
    it("renders a GFM table", async () => {
      const md = `| Col A | Col B |
| ----- | ----- |
| 1     | 2     |`;
      const html = await renderMarkdown(md);
      expect(html).toMatch(/<table[\s>]/);
      expect(html).toContain("<th>");
    });

    it("renders strikethrough", async () => {
      const html = await renderMarkdown("~~deleted~~");
      expect(html).toContain("<del>");
    });
  });

  describe("YAML front-matter stripping", () => {
    it("strips a standard front-matter block from rendered output", async () => {
      const md = `---
title: "Test Note"
created: 2026-01-01T00:00:00Z
modified: 2026-01-01T00:00:00Z
tags: [test]
---

# Test Note

Body content here.`;
      const html = await renderMarkdown(md);
      expect(html).not.toContain("title:");
      expect(html).not.toContain("created:");
      expect(html).not.toContain("modified:");
      expect(html).not.toContain("tags:");
      expect(html).not.toMatch(/<hr[\s/>]/);
      expect(html).toContain("Body content here.");
      expect(html).toMatch(/<h1[\s>]/);
    });

    it("renders normally when there is no front-matter", async () => {
      const md = "# No Front Matter\n\nJust body text.";
      const html = await renderMarkdown(md);
      expect(html).toContain("No Front Matter");
      expect(html).toContain("Just body text.");
    });

    it("does not strip --- that is not at the start of the document", async () => {
      const md = "# Title\n\nSome text.\n\n---\n\nMore text.";
      const html = await renderMarkdown(md);
      expect(html).toMatch(/<hr[\s/>]/);
      expect(html).toContain("Some text.");
      expect(html).toContain("More text.");
    });

    it("strips front-matter from sync rendering too", () => {
      const md = `---
title: "Sync Test"
tags: []
---

# Hello`;
      const html = renderMarkdownSync(md);
      expect(html).not.toContain("title:");
      expect(html).toMatch(/<h1[\s>]/);
      expect(html).toContain("Hello");
    });
  });
});
