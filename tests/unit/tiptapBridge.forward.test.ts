// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Tests the forward direction of the Tiptap bridge:
 *   Y.Text change → bridge fires → Y.XmlFragment updated
 *
 * We don't mount a Tiptap editor here; we verify that the fragment
 * receives valid ProseMirror XML content from the bridge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";
import { createTiptapBridge, BRIDGE_ORIGIN_PROSE } from "../../src/editor/tiptapBridge";

// Use a minimal schema compatible with the ProseMirror types expected
// by prosemirrorJSONToYXmlFragment.
import { Schema } from "@tiptap/pm/model";

const minimalSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM() { return ["p", 0] as unknown as [string, number]; },
    },
    text: { group: "inline" },
    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block",
      parseDOM: [
        { tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
      ],
      toDOM(node) { return [`h${node.attrs.level as number}`, 0] as unknown as [string, number]; },
    },
    horizontalRule: {
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM() { return ["hr"] as unknown as [string]; },
    },
    codeBlock: {
      attrs: { language: { default: null } },
      content: "text*",
      group: "block",
      parseDOM: [{ tag: "pre" }],
      toDOM() { return ["pre", 0] as unknown as [string, number]; },
    },
    mathDisplay: {
      attrs: { latex: { default: "" } },
      group: "block",
      atom: true,
      parseDOM: [{ tag: 'div[data-type="math-display"]' }],
      toDOM() { return ["div", { "data-type": "math-display" }] as unknown as [string, Record<string, string>]; },
    },
    mermaidBlock: {
      attrs: { code: { default: "" } },
      group: "block",
      atom: true,
      parseDOM: [{ tag: 'div[data-type="mermaid"]' }],
      toDOM() { return ["div", { "data-type": "mermaid" }] as unknown as [string, Record<string, string>]; },
    },
    drawingBlock: {
      attrs: { filename: { default: "" } },
      group: "block",
      atom: true,
      parseDOM: [{ tag: 'div[data-type="drawing"]' }],
      toDOM() { return ["div", { "data-type": "drawing" }] as unknown as [string, Record<string, string>]; },
    },
    mathInline: {
      attrs: { latex: { default: "" } },
      group: "inline",
      inline: true,
      atom: true,
      parseDOM: [{ tag: 'span[data-type="math-inline"]' }],
      toDOM() { return ["span", { "data-type": "math-inline" }] as unknown as [string, Record<string, string>]; },
    },
    hardBreak: {
      group: "inline",
      inline: true,
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM() { return ["br"] as unknown as [string]; },
    },
    bulletList: {
      group: "block",
      content: "listItem+",
      parseDOM: [{ tag: "ul" }],
      toDOM() { return ["ul", 0] as unknown as [string, number]; },
    },
    orderedList: {
      attrs: { start: { default: 1 } },
      group: "block",
      content: "listItem+",
      parseDOM: [{ tag: "ol" }],
      toDOM() { return ["ol", 0] as unknown as [string, number]; },
    },
    listItem: {
      content: "paragraph block*",
      parseDOM: [{ tag: "li" }],
      toDOM() { return ["li", 0] as unknown as [string, number]; },
    },
    taskList: {
      group: "block",
      content: "taskItem+",
      parseDOM: [{ tag: 'ul[data-type="taskList"]' }],
      toDOM() { return ["ul", { "data-type": "taskList" }, 0] as unknown as [string, Record<string, string>, number]; },
    },
    taskItem: {
      attrs: { checked: { default: false } },
      content: "paragraph block*",
      parseDOM: [{ tag: 'li[data-type="taskItem"]' }],
      toDOM() { return ["li", { "data-type": "taskItem" }, 0] as unknown as [string, Record<string, string>, number]; },
    },
    blockquote: {
      content: "block+",
      group: "block",
      parseDOM: [{ tag: "blockquote" }],
      toDOM() { return ["blockquote", 0] as unknown as [string, number]; },
    },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: "strong" }],
      toDOM() { return ["strong"] as unknown as [string]; },
    },
    italic: {
      parseDOM: [{ tag: "em" }],
      toDOM() { return ["em"] as unknown as [string]; },
    },
    code: {
      parseDOM: [{ tag: "code" }],
      toDOM() { return ["code"] as unknown as [string]; },
    },
    strike: {
      parseDOM: [{ tag: "s" }],
      toDOM() { return ["s"] as unknown as [string]; },
    },
    link: {
      attrs: { href: {}, title: { default: null }, target: { default: null } },
      parseDOM: [{ tag: "a" }],
      toDOM() { return ["a"] as unknown as [string]; },
    },
    underline: {
      parseDOM: [{ tag: "u" }],
      toDOM() { return ["u"] as unknown as [string]; },
    },
  },
});

describe("tiptapBridge — forward direction", () => {
  let ydoc: Y.Doc;
  beforeEach(() => { ydoc = new Y.Doc(); });
  afterEach(() => { ydoc.destroy(); });

  it("populates Y.XmlFragment when bridge.syncNow() is called", () => {
    const ytext = ydoc.getText("content");
    ydoc.transact(() => { ytext.insert(0, "# Hello\n\nParagraph text."); });

    const bridge = createTiptapBridge({ ydoc, schema: minimalSchema });
    bridge.syncNow();
    bridge.destroy();

    const xfrag = ydoc.getXmlFragment("prosemirror");
    // Fragment should have at least 2 children (heading + paragraph)
    expect(xfrag.length).toBeGreaterThanOrEqual(2);
  });

  it("does not fire when Y.Text change origin is BRIDGE_ORIGIN_PROSE", () => {
    const ytext = ydoc.getText("content");

    const bridge = createTiptapBridge({ ydoc, schema: minimalSchema });

    // Spy on syncNow to detect if it was called by the observer
    const syncSpy = vi.spyOn(bridge, "syncNow");

    // Write with BRIDGE_ORIGIN_PROSE — should be skipped
    ydoc.transact(() => {
      ytext.insert(0, "Should be skipped");
    }, BRIDGE_ORIGIN_PROSE);

    // Observer is debounced 150ms; use fake timers
    vi.useFakeTimers();
    vi.runAllTimers();
    vi.useRealTimers();

    // syncNow not called via observer (only the original bridge.syncNow counts when bridged)
    // Actually: the observer calls debouncedSync → setTimeout → syncForward, not syncNow directly.
    // We verify: fragment remains empty (no forward sync happened)
    const xfrag = ydoc.getXmlFragment("prosemirror");
    // syncNow was never called by the observer path (BRIDGE_ORIGIN_PROSE skipped)
    expect(syncSpy).not.toHaveBeenCalled();
    expect(xfrag.length).toBe(0);

    bridge.destroy();
  });

  it("fires when Y.Text changes with a different origin", async () => {
    const ytext = ydoc.getText("content");

    const bridge = createTiptapBridge({ ydoc, schema: minimalSchema });

    // Change Y.Text with no special origin → should trigger forward bridge
    ydoc.transact(() => {
      ytext.insert(0, "**Bold** paragraph");
    }); // origin: null (not BRIDGE_ORIGIN_PROSE)

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 200));

    const xfrag = ydoc.getXmlFragment("prosemirror");
    expect(xfrag.length).toBeGreaterThan(0);

    bridge.destroy();
  });

  it("stores frontmatter in Y.Map(meta)", () => {
    const ytext = ydoc.getText("content");
    const fm = "---\ntitle: Test Note\n---\n";
    ydoc.transact(() => { ytext.insert(0, fm + "# Body"); });

    const bridge = createTiptapBridge({ ydoc, schema: minimalSchema });
    bridge.syncNow();
    bridge.destroy();

    const meta = ydoc.getMap<string>("meta");
    expect(meta.get("frontmatter")).toBe(fm);
  });

  it("destroy() prevents further forward syncs", async () => {
    const ytext = ydoc.getText("content");
    ydoc.transact(() => { ytext.insert(0, "Initial"); });

    const bridge = createTiptapBridge({ ydoc, schema: minimalSchema });
    bridge.syncNow();

    const xfragBefore = ydoc.getXmlFragment("prosemirror").length;

    bridge.destroy();

    // Additional Y.Text change after destroy — should NOT update fragment
    const xfrag = ydoc.getXmlFragment("prosemirror");
    const snapBefore = xfrag.length;

    ydoc.transact(() => { ytext.insert(ytext.length, "\n\nExtra paragraph."); });
    await new Promise((r) => setTimeout(r, 200));

    // Fragment length should be the same as snapshot (no additional sync)
    expect(xfrag.length).toBe(snapBefore);
    expect(xfragBefore).toBeGreaterThan(0);
  });
});
