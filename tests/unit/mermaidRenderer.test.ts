// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock mermaid before importing the module under test so the top-level
// mermaid.initialize() call gets the mock, not the real library.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

// Import AFTER vi.mock so the hoisted mock is in place.
import { renderMermaidBlocks } from "../../src/utils/mermaidRenderer";
import mermaid from "mermaid";

const mockRender = vi.mocked(mermaid.render);

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g><text>A</text></g></svg>';

beforeEach(() => {
  vi.resetAllMocks();
});

describe("renderMermaidBlocks", () => {
  it("replaces a `code.language-mermaid` block with an SVG diagram on success", async () => {
    mockRender.mockResolvedValueOnce({
      svg: VALID_SVG,
      bindFunctions: undefined,
    } as Awaited<ReturnType<typeof mermaid.render>>);

    const container = document.createElement("div");
    container.innerHTML =
      '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>';
    document.body.appendChild(container);

    await renderMermaidBlocks(container);

    // Source code block must be gone.
    expect(container.querySelector("code.language-mermaid")).toBeNull();

    // The wrapper div with the correct CSS class must be present.
    const wrapper = container.querySelector(".mermaid-container");
    expect(wrapper).not.toBeNull();

    // An SVG element must be inside it — no error div allowed.
    expect(wrapper!.querySelector("svg")).not.toBeNull();
    expect(container.querySelector(".mermaid-error")).toBeNull();

    document.body.removeChild(container);
  });

  it("shows `[Mermaid render error: …]` inline on render failure (never throws)", async () => {
    mockRender.mockRejectedValueOnce(new Error("Syntax error in text"));

    const container = document.createElement("div");
    container.innerHTML =
      '<pre><code class="language-mermaid">not valid mermaid</code></pre>';
    document.body.appendChild(container);

    await expect(renderMermaidBlocks(container)).resolves.toBeUndefined();

    expect(container.querySelector("code.language-mermaid")).toBeNull();

    const errDiv = container.querySelector(".mermaid-error");
    expect(errDiv).not.toBeNull();
    expect(errDiv!.textContent).toMatch(/Mermaid render error/);
    expect(errDiv!.textContent).toMatch(/Syntax error in text/);

    // Must not have produced an SVG diagram.
    expect(container.querySelector(".mermaid-container")).toBeNull();

    document.body.removeChild(container);
  });

  it("leaves a container with no mermaid blocks unchanged", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>hello</p><pre><code>x = 1</code></pre>";
    const before = container.innerHTML;
    await renderMermaidBlocks(container);
    expect(container.innerHTML).toBe(before);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("passes the diagram source text to mermaid.render", async () => {
    mockRender.mockResolvedValueOnce({
      svg: VALID_SVG,
      bindFunctions: undefined,
    } as Awaited<ReturnType<typeof mermaid.render>>);

    const source = "sequenceDiagram\n  A->>B: hello";
    const container = document.createElement("div");
    container.innerHTML = `<pre><code class="language-mermaid">${source}</code></pre>`;
    document.body.appendChild(container);

    await renderMermaidBlocks(container);

    expect(mockRender).toHaveBeenCalledOnce();
    expect(mockRender.mock.calls[0][1]).toBe(source);

    document.body.removeChild(container);
  });

  it("skips replacement when <pre> is detached before mermaid.render resolves", async () => {
    let resolve: (v: Awaited<ReturnType<typeof mermaid.render>>) => void;
    mockRender.mockReturnValueOnce(
      new Promise<Awaited<ReturnType<typeof mermaid.render>>>((r) => { resolve = r; }),
    );

    const container = document.createElement("div");
    container.innerHTML =
      '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>';
    document.body.appendChild(container);

    const renderPromise = renderMermaidBlocks(container);

    // Simulate React resetting dangerouslySetInnerHTML while mermaid is awaiting.
    container.innerHTML =
      '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>';

    resolve!({ svg: VALID_SVG, bindFunctions: undefined } as Awaited<ReturnType<typeof mermaid.render>>);
    await renderPromise;

    // The stale <pre> was detached — isConnected check must skip it.
    // The fresh <pre> from the reset innerHTML should be untouched (not replaced).
    expect(container.querySelector("code.language-mermaid")).not.toBeNull();
    expect(container.querySelector(".mermaid-container")).toBeNull();

    document.body.removeChild(container);
  });

  it("skips replacement when isCancelled returns true before mermaid.render resolves", async () => {
    let resolve: (v: Awaited<ReturnType<typeof mermaid.render>>) => void;
    mockRender.mockReturnValueOnce(
      new Promise<Awaited<ReturnType<typeof mermaid.render>>>((r) => { resolve = r; }),
    );

    const container = document.createElement("div");
    container.innerHTML =
      '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>';
    document.body.appendChild(container);

    let cancelled = false;
    const renderPromise = renderMermaidBlocks(container, () => cancelled);

    cancelled = true;
    resolve!({ svg: VALID_SVG, bindFunctions: undefined } as Awaited<ReturnType<typeof mermaid.render>>);
    await renderPromise;

    // Cancelled — no replacement should have happened.
    expect(container.querySelector("code.language-mermaid")).not.toBeNull();
    expect(container.querySelector(".mermaid-container")).toBeNull();

    document.body.removeChild(container);
  });
});
