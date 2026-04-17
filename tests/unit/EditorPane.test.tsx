// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import EditorPane from "../../src/components/EditorPane";
import useEditorStore from "../../src/stores/editorStore";

// biome-ignore lint/suspicious/noExplicitAny: test-only access to window stub
const invokeMock = (window as any).__TAURI_INTERNALS__.invoke as ReturnType<
  typeof vi.fn
>;

function resetStores() {
  useEditorStore.setState({
    ydocs: {},
    dirtyStates: {},
    autosaveTimers: {},
    cursorLines: {},
  });
}

describe("EditorPane — file not found card", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetStores();
  });

  it("shows the ⚠ File not found card when read_note rejects", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "read_note") {
        return Promise.reject(new Error("File not found"));
      }
      return Promise.resolve(undefined);
    });

    render(<EditorPane tileId="tile-1" filePath="/missing/note.md" />);

    const card = await waitFor(() =>
      screen.getByTestId("file-not-found-tile-1"),
    );
    expect(card).toBeInTheDocument();
    expect(card.textContent).toMatch(/File not found on disk/);
    expect(card.textContent).toContain("/missing/note.md");
  });

  it("does not show the card when read_note succeeds", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "read_note") return Promise.resolve("# Title\n");
      return Promise.resolve(undefined);
    });

    render(<EditorPane tileId="tile-2" filePath="/proj/note.md" />);
    // Let the microtask that resolves `read_note` run.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("file-not-found-tile-2")).toBeNull();
  });

  it("does not show the card when filePath is null", () => {
    render(<EditorPane tileId="tile-3" filePath={null} />);
    expect(screen.queryByTestId("file-not-found-tile-3")).toBeNull();
  });
});
