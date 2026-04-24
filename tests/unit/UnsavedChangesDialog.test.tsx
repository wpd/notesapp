// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UnsavedChangesDialog from "../../src/components/UnsavedChangesDialog";
import useLayoutStore from "../../src/stores/layoutStore";
import useEditorStore from "../../src/stores/editorStore";
import * as Y from "yjs";

const invokeMock = (
  window as unknown as { __TAURI_INTERNALS__: { invoke: ReturnType<typeof vi.fn> } }
).__TAURI_INTERNALS__.invoke;

function resetStores() {
  useLayoutStore.setState({
    mosaicTree: {
      direction: "row",
      first: "editor-1",
      second: "editor-2",
      splitPercentage: 50,
    },
    tiles: {
      "editor-1": { id: "editor-1", mode: "editor", filePath: "/p/note.md" },
      "editor-2": { id: "editor-2", mode: "editor", filePath: "/p/other.md" },
    },
    focusedTileId: "editor-1",
    pinnedTileId: null,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 2,
    statusMessage: null,
    pendingDialog: null,
  });
  const doc = new Y.Doc();
  doc.getText("content").insert(0, "draft content");
  useEditorStore.setState({
    ydocs: { "/p/note.md": doc },
    dirtyStates: { "editor-1": true },
    autosaveTimers: {},
    cursorLines: {},
  });
}

describe("UnsavedChangesDialog", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    resetStores();
  });

  it("renders nothing when pendingDialog is null", () => {
    useLayoutStore.setState({ pendingDialog: null });
    const { container } = render(<UnsavedChangesDialog />);
    expect(container.firstChild).toBeNull();
  });

  describe("single-release (close) dialog", () => {
    beforeEach(() => {
      useLayoutStore.setState({
        pendingDialog: {
          kind: "close",
          tileId: "editor-1",
          filePath: "/p/note.md",
        },
      });
    });

    it("shows the file name in the body", () => {
      render(<UnsavedChangesDialog />);
      const dialog = screen.getByTestId("unsaved-dialog");
      expect(dialog.textContent).toContain("note.md");
      expect(dialog.textContent).toMatch(/unsaved changes/i);
    });

    it("Cancel dismisses the dialog and does not close the tile", () => {
      render(<UnsavedChangesDialog />);
      fireEvent.click(screen.getByTestId("unsaved-dialog-cancel"));
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      expect(useLayoutStore.getState().tiles["editor-1"]).toBeDefined();
    });

    it("Save invokes write_note + delete_tmp and then closes the tile", async () => {
      render(<UnsavedChangesDialog />);
      fireEvent.click(screen.getByTestId("unsaved-dialog-save"));

      await waitFor(() => {
        expect(useLayoutStore.getState().tiles["editor-1"]).toBeUndefined();
      });
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      const calls = invokeMock.mock.calls.map((c) => c[0]);
      expect(calls).toContain("write_note");
      expect(calls).toContain("delete_tmp");
    });

    it("Discard invokes delete_tmp (but not write_note) and closes the tile", async () => {
      render(<UnsavedChangesDialog />);
      fireEvent.click(screen.getByTestId("unsaved-dialog-discard"));

      await waitFor(() => {
        expect(useLayoutStore.getState().tiles["editor-1"]).toBeUndefined();
      });
      const calls = invokeMock.mock.calls.map((c) => c[0]);
      expect(calls).toContain("delete_tmp");
      expect(calls).not.toContain("write_note");
      expect(useEditorStore.getState().dirtyStates["editor-1"]).toBe(false);
    });
  });

  describe("single-release (buffer) dialog", () => {
    beforeEach(() => {
      useLayoutStore.setState({
        pendingDialog: {
          kind: "buffer",
          tileId: "editor-1",
          newFilePath: "/p/new.md",
          newMode: "preview",
          oldFilePath: "/p/note.md",
        },
      });
    });

    it("Save writes the old buffer and then rebinds to the new file/mode", async () => {
      render(<UnsavedChangesDialog />);
      fireEvent.click(screen.getByTestId("unsaved-dialog-save"));

      await waitFor(() => {
        const tile = useLayoutStore.getState().tiles["editor-1"];
        expect(tile.filePath).toBe("/p/new.md");
        expect(tile.mode).toBe("preview");
      });
    });

    it("Cancel leaves the tile bound to the old file in its old mode", () => {
      render(<UnsavedChangesDialog />);
      fireEvent.click(screen.getByTestId("unsaved-dialog-cancel"));
      const tile = useLayoutStore.getState().tiles["editor-1"];
      expect(tile.filePath).toBe("/p/note.md");
      expect(tile.mode).toBe("editor");
    });
  });

  describe("consolidated quit dialog", () => {
    beforeEach(() => {
      useLayoutStore.setState({
        pendingDialog: {
          kind: "quit",
          dirtyBuffers: [
            {
              filePath: "/p/a.md",
              representativeTileId: "editor-1",
            },
            {
              filePath: "/p/b.md",
              representativeTileId: "editor-2",
            },
          ],
        },
      });
    });

    it("lists every dirty buffer", () => {
      render(<UnsavedChangesDialog />);
      expect(screen.getByTestId("quit-dialog-item-a.md")).toBeInTheDocument();
      expect(screen.getByTestId("quit-dialog-item-b.md")).toBeInTheDocument();
    });

    it("toggling a checkbox flips that buffer's save/discard label", () => {
      render(<UnsavedChangesDialog />);
      const cb = screen.getByTestId(
        "quit-dialog-save-a.md",
      ) as HTMLInputElement;
      expect(cb.checked).toBe(true);
      fireEvent.click(cb);
      expect(cb.checked).toBe(false);
    });

    it("Cancel dismisses without saving or discarding", () => {
      render(<UnsavedChangesDialog />);
      fireEvent.click(screen.getByTestId("quit-dialog-cancel"));
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      expect(invokeMock).not.toHaveBeenCalled();
    });
  });

  describe("missing-recovery dialog (SPEC §5.5)", () => {
    let continued: number;
    beforeEach(() => {
      continued = 0;
      useLayoutStore.setState({
        tiles: {
          "editor-1": {
            id: "editor-1",
            mode: "missing",
            filePath: null,
            missingPath: "/p/note.md",
          },
        },
        pendingDialog: {
          kind: "missing-recovery",
          tileId: "editor-1",
          missingPath: "/p/note.md",
          action: "close",
          onContinue: () => {
            continued += 1;
          },
        },
      });
    });

    it("shows a Continue/Cancel pair (no Save) and the missing filename", () => {
      render(<UnsavedChangesDialog />);
      const dialog = screen.getByTestId("missing-recovery-dialog");
      expect(dialog.textContent).toContain("note.md");
      expect(screen.getByTestId("missing-recovery-continue")).toBeInTheDocument();
      expect(screen.getByTestId("missing-recovery-cancel")).toBeInTheDocument();
      expect(screen.queryByTestId("unsaved-dialog-save")).toBeNull();
    });

    it("Cancel dismisses and does not invoke onContinue", () => {
      render(<UnsavedChangesDialog />);
      fireEvent.click(screen.getByTestId("missing-recovery-cancel"));
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      expect(continued).toBe(0);
    });

    it("Continue calls onContinue, clears dirty, and dismisses", () => {
      useEditorStore.setState({ dirtyStates: { "editor-1": true } });
      render(<UnsavedChangesDialog />);
      fireEvent.click(screen.getByTestId("missing-recovery-continue"));
      expect(continued).toBe(1);
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      expect(useEditorStore.getState().dirtyStates["editor-1"]).toBe(false);
    });
  });
});
