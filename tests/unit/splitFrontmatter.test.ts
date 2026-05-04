// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect } from "vitest";
import { splitFrontmatter } from "../../src/utils/markdownPipeline";

describe("splitFrontmatter", () => {
  it("returns empty frontmatter and full body when no front-matter present", () => {
    const text = "# Hello\n\nBody text.";
    const { frontmatter, body } = splitFrontmatter(text);
    expect(frontmatter).toBe("");
    expect(body).toBe(text);
  });

  it("splits a standard front-matter block from the body", () => {
    const text = "---\ntitle: Test\ntags: [foo]\n---\n# Heading\nBody.";
    const { frontmatter, body } = splitFrontmatter(text);
    expect(frontmatter).toBe("---\ntitle: Test\ntags: [foo]\n---\n");
    expect(body).toBe("# Heading\nBody.");
  });

  it("handles front-matter that ends at EOF (no trailing newline after ---)", () => {
    const text = "---\ntitle: T\n---";
    const { frontmatter, body } = splitFrontmatter(text);
    expect(frontmatter).toBe("---\ntitle: T\n---");
    expect(body).toBe("");
  });

  it("does not treat mid-document --- as front-matter", () => {
    const text = "# Heading\n\n---\n\nHR above";
    const { frontmatter, body } = splitFrontmatter(text);
    expect(frontmatter).toBe("");
    expect(body).toBe(text);
  });

  it("preserves body when front-matter is present but body is empty", () => {
    const text = "---\ntitle: Empty\n---\n";
    const { frontmatter, body } = splitFrontmatter(text);
    expect(frontmatter).toBe("---\ntitle: Empty\n---\n");
    expect(body).toBe("");
  });

  it("round-trips: frontmatter + body equals original text", () => {
    const original = "---\ntitle: Round-trip\ncreated: 2026-01-01\n---\n\n# Body\n\nContent here.";
    const { frontmatter, body } = splitFrontmatter(original);
    expect(frontmatter + body).toBe(original);
  });

  it("stops at first closing --- even with multiple --- in body", () => {
    const text = "---\ntitle: Multi\n---\n\nPara\n\n---\n\nAnother para";
    const { frontmatter, body } = splitFrontmatter(text);
    expect(frontmatter).toBe("---\ntitle: Multi\n---\n");
    expect(body).toBe("\nPara\n\n---\n\nAnother para");
  });
});
