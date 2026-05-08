// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Tests for the paste-transform utility used by WysiwygPane (ISSUE-012).
 *
 * `transformPastedText` is the function registered as
 *   `editorProps.transformPastedText` in WysiwygPane's useEditor call.
 * It converts Markdown-flavoured plain-text clipboard content to HTML so
 * ProseMirror's clipboard parser can reconstruct the formatted node tree.
 */

import { describe, it, expect } from "vitest";
import { transformPastedText, MARKDOWN_PASTE_RE } from "../../src/utils/pasteTransform";

// ---------------------------------------------------------------------------
// Regex detection tests
// ---------------------------------------------------------------------------

describe("MARKDOWN_PASTE_RE — detection heuristic", () => {
  const markdownSamples: [string, string][] = [
    ["ATX heading",       "# Hello"],
    ["H2 heading",        "## Section"],
    ["H6 heading",        "###### Deep"],
    ["bold",              "**bold text**"],
    ["underline-bold",    "__bold via underscores__"],
    ["italic asterisk",   "*single asterisk*"],
    ["italic underscore", "_italic_"],
    ["unordered list",    "- item one"],
    ["ordered list",      "1. first item"],
    ["blockquote",        "> quoted text"],
    ["fenced code",       "```\ncode\n```"],
    ["inline math",       "$E = mc^2$"],
  ];

  for (const [label, sample] of markdownSamples) {
    it(`detects ${label}`, () => {
      expect(MARKDOWN_PASTE_RE.test(sample.trim())).toBe(true);
    });
  }

  it("does not match plain prose", () => {
    expect(MARKDOWN_PASTE_RE.test("Just a normal sentence.")).toBe(false);
  });

  it("does not match an empty string", () => {
    expect(MARKDOWN_PASTE_RE.test("")).toBe(false);
  });

  it("does not match a number-only string", () => {
    expect(MARKDOWN_PASTE_RE.test("12345")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// transformPastedText behaviour tests
// ---------------------------------------------------------------------------

describe("transformPastedText — plain text passes through unchanged", () => {
  it("returns plain prose unchanged", () => {
    const text = "This is ordinary text without any markdown syntax.";
    expect(transformPastedText(text)).toBe(text);
  });

  it("returns an empty string unchanged", () => {
    expect(transformPastedText("")).toBe("");
  });

  it("returns whitespace-only string unchanged", () => {
    expect(transformPastedText("   \n  ")).toBe("   \n  ");
  });
});

describe("transformPastedText — markdown text is converted to HTML", () => {
  it("converts a heading to an <h1> tag", () => {
    const result = transformPastedText("# Hello World");
    expect(result).toMatch(/<h1[^>]*>/i);
    expect(result).toContain("Hello World");
  });

  it("converts bold syntax to <strong>", () => {
    const result = transformPastedText("**bold text**");
    expect(result).toMatch(/<strong>/i);
    expect(result).toContain("bold text");
  });

  it("converts a bullet list to <ul><li>", () => {
    const result = transformPastedText("- item one\n- item two");
    expect(result).toMatch(/<ul/i);
    expect(result).toMatch(/<li/i);
    expect(result).toContain("item one");
    expect(result).toContain("item two");
  });

  it("converts an ordered list to <ol><li>", () => {
    const result = transformPastedText("1. first\n2. second");
    expect(result).toMatch(/<ol/i);
    expect(result).toMatch(/<li/i);
  });

  it("converts a blockquote to <blockquote>", () => {
    const result = transformPastedText("> quoted text");
    expect(result).toMatch(/<blockquote/i);
    expect(result).toContain("quoted text");
  });

  it("converts fenced code to <pre><code>", () => {
    const result = transformPastedText("```\nconst x = 1;\n```");
    expect(result).toMatch(/<pre/i);
    expect(result).toContain("const x = 1");
  });

  it("returns HTML as a string (not the original markdown)", () => {
    const md = "# Title\n\nBody paragraph.";
    const result = transformPastedText(md);
    // Should produce HTML, not the raw markdown source.
    expect(result).not.toBe(md);
    expect(result).toMatch(/<h1/i);
  });

  it("trims leading/trailing whitespace before detection but preserves full input for rendering", () => {
    // Input has leading whitespace — the trim is only for detection.
    // renderMarkdownSync receives the full text, so the heading must appear.
    const result = transformPastedText("  # Indented Heading");
    expect(result).toMatch(/<h1/i);
  });
});
