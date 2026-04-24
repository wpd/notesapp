// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach, vi } from "vitest";
import useEditorStore from "../../src/stores/editorStore";

const invokeMock = (
  window as unknown as { __TAURI_INTERNALS__: { invoke: ReturnType<typeof vi.fn> } }
).__TAURI_INTERNALS__.invoke;

function resetStore() {
  useEditorStore.setState({
    ydocs: {},
    dirtyStates: {},
    autosaveTimers: {},
    cursorLines: {},
    savedContents: {},
  });
}

describe("editorStore — savedContents / undo-to-clean", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetStore();
  });

  it("setSavedContent records content for a file path", () => {
    useEditorStore.getState().setSavedContent("/proj/a.md", "hello");
    expect(useEditorStore.getState().savedContents["/proj/a.md"]).toBe("hello");
  });

  it("isContentClean returns false when no saved content recorded", () => {
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "hello"),
    ).toBe(false);
  });

  it("isContentClean returns true when content matches saved content", () => {
    useEditorStore.getState().setSavedContent("/proj/a.md", "hello");
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "hello"),
    ).toBe(true);
  });

  it("isContentClean returns false when content differs from saved content", () => {
    useEditorStore.getState().setSavedContent("/proj/a.md", "hello");
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "hello world"),
    ).toBe(false);
  });

  it("isContentClean is case-sensitive and whitespace-sensitive", () => {
    useEditorStore.getState().setSavedContent("/proj/a.md", "Hello\n");
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "hello\n"),
    ).toBe(false);
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "Hello"),
    ).toBe(false);
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "Hello\n"),
    ).toBe(true);
  });

  it("setSavedContent overwrites earlier value", () => {
    useEditorStore.getState().setSavedContent("/proj/a.md", "v1");
    useEditorStore.getState().setSavedContent("/proj/a.md", "v2");
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "v1"),
    ).toBe(false);
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "v2"),
    ).toBe(true);
  });

  it("savedContents are independent per file path", () => {
    useEditorStore.getState().setSavedContent("/proj/a.md", "alpha");
    useEditorStore.getState().setSavedContent("/proj/b.md", "beta");
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "alpha"),
    ).toBe(true);
    expect(
      useEditorStore.getState().isContentClean("/proj/b.md", "beta"),
    ).toBe(true);
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "beta"),
    ).toBe(false);
  });
});

describe("editorStore — saveFile updates savedContents", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetStore();
  });

  it("saveFile records the saved content and clears dirty", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "write_note") return Promise.resolve(undefined);
      if (cmd === "delete_tmp") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    // Set up Y.Doc with content
    const ydoc = useEditorStore.getState().getOrCreateYDoc("/proj/a.md");
    ydoc.getText("content").insert(0, "saved content");

    useEditorStore.getState().setDirty("tile-1", true);

    await useEditorStore.getState().saveFile("tile-1", "/proj/a.md");

    expect(useEditorStore.getState().isDirty("tile-1")).toBe(false);
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "saved content"),
    ).toBe(true);
  });

  it("saveFile updates savedContents so subsequent undo-to-save-point is detectable", async () => {
    invokeMock.mockResolvedValue(undefined);

    const ydoc = useEditorStore.getState().getOrCreateYDoc("/proj/a.md");
    const ytext = ydoc.getText("content");

    // Simulate: load "original", save as "edited"
    ytext.insert(0, "edited");
    useEditorStore.getState().setSavedContent("/proj/a.md", "original");

    await useEditorStore.getState().saveFile("tile-1", "/proj/a.md");

    // Now "edited" is the new save point
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "edited"),
    ).toBe(true);
    expect(
      useEditorStore.getState().isContentClean("/proj/a.md", "original"),
    ).toBe(false);
  });
});
