// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
});

let mermaidIdCounter = 0;

export async function renderMermaidBlocks(
  container: HTMLElement,
  isCancelled?: () => boolean,
): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>(
    "code.language-mermaid",
  );
  for (const codeEl of Array.from(blocks)) {
    if (isCancelled?.()) return;
    const source = codeEl.textContent ?? "";
    const pre = codeEl.closest("pre") ?? codeEl;
    const id = `mermaid-${++mermaidIdCounter}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (isCancelled?.() || !pre.isConnected) continue;
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-container";
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch (err) {
      console.error("[mermaid] render failed:", err);
      if (isCancelled?.() || !pre.isConnected) continue;
      const errDiv = document.createElement("div");
      errDiv.className = "mermaid-error";
      errDiv.style.color = "var(--color-error)";
      errDiv.style.fontFamily = "var(--font-editor)";
      errDiv.style.fontSize = "12px";
      const msg = err instanceof Error ? err.message : String(err);
      errDiv.textContent = `[Mermaid render error: ${msg}]`;
      pre.replaceWith(errDiv);
    }
  }
}
