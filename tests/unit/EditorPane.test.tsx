// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import EditorPane from "../../src/components/EditorPane";
import useEditorStore from "../../src/stores/editorStore";
import useLayoutStore from "../../src/stores/layoutStore";

const invokeMock = (
  window as unknown as { __TAURI_INTERNALS__: { invoke: ReturnType<typeof vi.fn> } }
).__TAURI_INTERNALS__.invoke;

function resetStores() {
  useEditorStore.setState({
    ydocs: {},
    dirtyStates: {},
    autosaveTimers: {},
    cursorLines: {},
    savedContents: {},
  });
  useLayoutStore.setState({
    tiles: {
      "tile-1": { id: "tile-1", mode: "editor", filePath: "/missing/note.md" },
      "tile-2": { id: "tile-2", mode: "editor", filePath: "/proj/note.md" },
      "tile-3": { id: "tile-3", mode: "editor", filePath: null },
    },
    mosaicTree: "tile-1",
    focusedTileId: "tile-1",
    pinnedTileId: null,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 3,
    statusMessage: null,
  });
}

describe("EditorPane — savedContent baseline on load", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetStores();
  });

  it("records savedContent for the file after read_note resolves", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "read_note") return Promise.resolve("# Hello\n\nWorld\n");
      return Promise.resolve(undefined);
    });

    render(<EditorPane tileId="tile-2" filePath="/proj/note.md" />);
    await new Promise((r) => setTimeout(r, 0));

    expect(
      useEditorStore.getState().savedContents["/proj/note.md"],
    ).toBe("# Hello\n\nWorld\n");
  });

  it("does not record savedContent when filePath is null", () => {
    render(<EditorPane tileId="tile-3" filePath={null} />);
    expect(Object.keys(useEditorStore.getState().savedContents)).toHaveLength(0);
  });

  it("does not record savedContent when read_note rejects", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "read_note") return Promise.reject(new Error("not found"));
      return Promise.resolve(undefined);
    });

    render(<EditorPane tileId="tile-1" filePath="/missing/note.md" />);
    await new Promise((r) => setTimeout(r, 0));

    expect(
      useEditorStore.getState().savedContents["/missing/note.md"],
    ).toBeUndefined();
  });
});

describe("EditorPane — missing file transition", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetStores();
  });

  it("transitions tile to Missing mode when read_note rejects", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "read_note") {
        return Promise.reject(new Error("File not found"));
      }
      return Promise.resolve(undefined);
    });

    render(<EditorPane tileId="tile-1" filePath="/missing/note.md" />);

    await waitFor(() => {
      const tile = useLayoutStore.getState().tiles["tile-1"];
      expect(tile.mode).toBe("missing");
      expect(tile.missingPath).toBe("/missing/note.md");
    });
  });

  it("does not transition the tile when read_note succeeds", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "read_note") return Promise.resolve("# Title\n");
      return Promise.resolve(undefined);
    });

    render(<EditorPane tileId="tile-2" filePath="/proj/note.md" />);
    // Let the microtask that resolves `read_note` run.
    await new Promise((r) => setTimeout(r, 0));
    const tile = useLayoutStore.getState().tiles["tile-2"];
    expect(tile.mode).toBe("editor");
    expect(tile.missingPath).toBeUndefined();
  });

  it("does not call read_note when filePath is null", () => {
    render(<EditorPane tileId="tile-3" filePath={null} />);
    expect(
      invokeMock.mock.calls.some((call) => call[0] === "read_note"),
    ).toBe(false);
  });
});
