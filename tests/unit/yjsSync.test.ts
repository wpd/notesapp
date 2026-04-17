// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Tests that the Yjs CRDT document model works correctly:
 * - Two Y.Doc instances pointing to the same shared content stay in sync
 * - Edits made to one appear immediately in the other
 *
 * This tests the core CRDT logic without requiring a CodeMirror view.
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import useEditorStore from "../../src/stores/editorStore";

describe("Yjs Y.Doc sync", () => {
  it("creates a Y.Text and inserts content", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("content");
    doc.transact(() => {
      ytext.insert(0, "Hello, world!");
    });
    expect(ytext.toString()).toBe("Hello, world!");
  });

  it("two Y.Docs sharing encoded state stay in sync", () => {
    // Simulate two editors opening the same file:
    // They share the same Y.Doc instance in editorStore.
    // This test directly verifies Y.Doc state encoding/decoding.

    const doc1 = new Y.Doc();
    const ytext1 = doc1.getText("content");
    doc1.transact(() => {
      ytext1.insert(0, "Initial content");
    });

    // Encode state from doc1 and apply to doc2
    const doc2 = new Y.Doc();
    const stateVector = Y.encodeStateVector(doc2);
    const diff = Y.encodeStateAsUpdate(doc1, stateVector);
    Y.applyUpdate(doc2, diff);

    const ytext2 = doc2.getText("content");
    expect(ytext2.toString()).toBe("Initial content");
  });

  it("subsequent edits propagate between two docs", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const ytext1 = doc1.getText("content");
    const ytext2 = doc2.getText("content");

    // Initial sync
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    // Edit in doc1
    doc1.transact(() => {
      ytext1.insert(0, "Hello ");
    });

    // Propagate to doc2
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1, Y.encodeStateVector(doc2)));
    expect(ytext2.toString()).toBe("Hello ");

    // Edit in doc2
    doc2.transact(() => {
      ytext2.insert(ytext2.length, "World");
    });

    // Propagate back to doc1
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2, Y.encodeStateVector(doc1)));
    expect(ytext1.toString()).toBe("Hello World");
  });

  it("concurrent edits merge without conflict (CRDT property)", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Both start with the same initial state
    const ytext1 = doc1.getText("content");
    doc1.transact(() => {
      ytext1.insert(0, "shared");
    });
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    // Concurrent edits (both docs offline)
    doc1.transact(() => {
      doc1.getText("content").insert(6, " from1");
    });
    doc2.transact(() => {
      doc2.getText("content").insert(6, " from2");
    });

    // Merge
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2, Y.encodeStateVector(doc1)));
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1, Y.encodeStateVector(doc2)));

    // Both should now have the same content (order depends on CRDT algo, but they're equal)
    expect(doc1.getText("content").toString()).toBe(
      doc2.getText("content").toString(),
    );
    // Both contain "shared" and both edits
    const merged = doc1.getText("content").toString();
    expect(merged).toContain("shared");
    expect(merged).toContain("from1");
    expect(merged).toContain("from2");
  });

  it("editorStore getOrCreateYDoc returns the same instance for the same path", () => {
    const store = useEditorStore.getState();

    const doc1 = store.getOrCreateYDoc("/notes/test.md");
    const doc2 = store.getOrCreateYDoc("/notes/test.md");
    expect(doc1).toBe(doc2);

    const doc3 = store.getOrCreateYDoc("/notes/other.md");
    expect(doc1).not.toBe(doc3);
  });

  it("two CodeMirror tiles using the same Y.Doc share text", () => {
    // Simulate two "editor tiles" opening the same file.
    // They get the same Y.Doc instance from editorStore.
    const store = useEditorStore.getState();

    const filePath = "/notes/shared.md";
    const ydoc = store.getOrCreateYDoc(filePath);
    const ytext = ydoc.getText("content");

    // Tile 1 writes
    ydoc.transact(() => {
      ytext.insert(0, "Written by tile 1");
    });

    // Tile 2 reads the same doc
    const ydoc2 = store.getOrCreateYDoc(filePath);
    expect(ydoc2.getText("content").toString()).toBe("Written by tile 1");
    expect(ydoc2).toBe(ydoc); // same instance
  });
});
