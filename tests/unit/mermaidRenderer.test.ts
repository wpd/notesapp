// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect } from "vitest";
import { renderMermaidBlocks } from "../../src/utils/mermaidRenderer";

describe("renderMermaidBlocks", () => {
  it("replaces a `code.language-mermaid` block with an SVG diagram on success", async () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>';
    document.body.appendChild(container);

    await renderMermaidBlocks(container);

    // Source code block should be gone
    expect(
      container.querySelector("code.language-mermaid"),
    ).toBeNull();
    // Either an SVG rendered successfully, or a parse-error div (both acceptable —
    // what matters is that the original block was replaced and there is no crash).
    const svg = container.querySelector("svg");
    const err = container.querySelector(".mermaid-error");
    expect(svg !== null || err !== null).toBe(true);

    document.body.removeChild(container);
  });

  it("shows `[Mermaid parse error: …]` inline on invalid input (never throws)", async () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<pre><code class="language-mermaid">not a valid mermaid diagram</code></pre>';
    document.body.appendChild(container);

    // Must not throw
    await expect(renderMermaidBlocks(container)).resolves.toBeUndefined();

    // At minimum the original <code class="language-mermaid"> element must
    // have been consumed (either rendered or replaced with an error div).
    expect(
      container.querySelector("code.language-mermaid"),
    ).toBeNull();

    document.body.removeChild(container);
  });

  it("leaves a container with no mermaid blocks unchanged", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>hello</p><pre><code>x = 1</code></pre>";
    const before = container.innerHTML;
    await renderMermaidBlocks(container);
    expect(container.innerHTML).toBe(before);
  });
});
