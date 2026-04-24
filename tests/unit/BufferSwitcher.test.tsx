// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import BufferSwitcher from "../../src/components/BufferSwitcher";
import useProjectStore from "../../src/stores/projectStore";
import useLayoutStore from "../../src/stores/layoutStore";

const MOCK_NOTES = [
  { path: "/project/notes/alpha.md", name: "alpha", extension: "md", modified_at: 3 },
  { path: "/project/notes/beta.md", name: "beta", extension: "md", modified_at: 2 },
  { path: "/project/notes/gamma.md", name: "gamma", extension: "md", modified_at: 1 },
];

const MOCK_ALL_NOTES = [
  ...MOCK_NOTES,
  { path: "/project/notes/data.txt", name: "data.txt", extension: "txt", modified_at: 0 },
];

function getInvokeMock() {
  return (
    window as unknown as { __TAURI_INTERNALS__: { invoke: ReturnType<typeof vi.fn> } }
  ).__TAURI_INTERNALS__.invoke;
}

beforeEach(() => {
  useProjectStore.setState({
    projectDir: "/project",
    notes: MOCK_NOTES,
    isLoaded: true,
    error: null,
  });
  useLayoutStore.setState({
    focusedTileId: "editor-1",
    tiles: {
      "editor-1": { id: "editor-1", mode: "editor", filePath: null },
    },
    mosaicTree: "editor-1",
    pinnedTileId: null,
    sidebarVisible: true,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 0,
    statusMessage: null,
  });

  // Mock invoke to return notes for list commands
  const invokeMock = getInvokeMock();
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "list_notes_all") return Promise.resolve(MOCK_ALL_NOTES);
    if (cmd === "list_notes") return Promise.resolve(MOCK_NOTES);
    return Promise.resolve(undefined);
  });
});

describe("BufferSwitcher", () => {
  it("renders the input and list", () => {
    render(<BufferSwitcher onClose={() => {}} />);
    expect(screen.getByTestId("buffer-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-switcher-input")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-switcher-list")).toBeInTheDocument();
  });

  it("shows all notes when query is empty (editor picker)", async () => {
    render(<BufferSwitcher onClose={() => {}} pickerMode="editor" />);
    await waitFor(() => {
      expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
    });
    expect(screen.getByTestId("buffer-item-beta")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-item-gamma")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-item-data.txt")).toBeInTheDocument();
  });

  it("preview picker shows only .md files", async () => {
    render(<BufferSwitcher onClose={() => {}} pickerMode="preview" />);
    await waitFor(() => {
      expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("buffer-item-data.txt")).not.toBeInTheDocument();
  });

  it("filters notes by query", async () => {
    render(<BufferSwitcher onClose={() => {}} pickerMode="editor" />);
    await waitFor(() => {
      expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
    });
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "al" } });
    expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
    expect(screen.queryByTestId("buffer-item-beta")).not.toBeInTheDocument();
  });

  it("is case-insensitive in filtering", async () => {
    render(<BufferSwitcher onClose={() => {}} pickerMode="editor" />);
    await waitFor(() => {
      expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
    });
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "ALPHA" } });
    expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
  });

  it("shows 'Create new note' row when query has no exact match", async () => {
    render(<BufferSwitcher onClose={() => {}} pickerMode="editor" />);
    await waitFor(() => {
      expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
    });
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "newname" } });
    expect(screen.getByTestId("buffer-create-new")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-create-new").textContent).toContain(
      "newname",
    );
  });

  it("shows '+ New note…' at top when query is empty", async () => {
    render(<BufferSwitcher onClose={() => {}} pickerMode="editor" />);
    await waitFor(() => {
      expect(screen.getByTestId("buffer-new-note-top")).toBeInTheDocument();
    });
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(<BufferSwitcher onClose={onClose} pickerMode="editor" />);
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when overlay background is clicked", () => {
    const onClose = vi.fn();
    render(<BufferSwitcher onClose={onClose} pickerMode="editor" />);
    fireEvent.click(screen.getByTestId("buffer-switcher-overlay"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reference-stub shows placeholder message", () => {
    render(<BufferSwitcher onClose={() => {}} pickerMode="reference-stub" />);
    expect(screen.getByTestId("buffer-switcher-stub")).toBeInTheDocument();
    expect(screen.getByText("Reference mode is not yet available.")).toBeInTheDocument();
  });

  it("aichat-stub shows placeholder message", () => {
    render(<BufferSwitcher onClose={() => {}} pickerMode="aichat-stub" />);
    expect(screen.getByTestId("buffer-switcher-stub")).toBeInTheDocument();
    expect(screen.getByText("AI Chat mode is not yet available.")).toBeInTheDocument();
  });

  describe("+ New note extension validation (SPEC §4.0.2)", () => {
    it("Editor picker creates a non-.md file verbatim via create_note", async () => {
      const invokeMock = getInvokeMock();
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === "list_notes_all") return Promise.resolve(MOCK_ALL_NOTES);
        if (cmd === "list_notes") return Promise.resolve(MOCK_NOTES);
        if (cmd === "create_note") {
          return Promise.resolve("/project/notes/scratch.txt");
        }
        return Promise.resolve(undefined);
      });

      render(<BufferSwitcher onClose={() => {}} pickerMode="editor" />);
      await waitFor(() =>
        expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument(),
      );
      const input = screen.getByTestId("buffer-switcher-input");
      fireEvent.change(input, { target: { value: "scratch.txt" } });
      fireEvent.click(screen.getByTestId("buffer-create-new"));

      await waitFor(() => {
        const createCall = invokeMock.mock.calls.find(
          (c) => c[0] === "create_note",
        );
        expect(createCall).toBeDefined();
        expect(createCall![1]).toMatchObject({ name: "scratch.txt" });
      });
      expect(
        screen.queryByTestId("buffer-switcher-validation-error"),
      ).toBeNull();
    });

    it("Preview picker rejects a non-.md filename with an inline message", async () => {
      const invokeMock = getInvokeMock();
      render(<BufferSwitcher onClose={() => {}} pickerMode="preview" />);
      await waitFor(() =>
        expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument(),
      );
      const input = screen.getByTestId("buffer-switcher-input");
      fireEvent.change(input, { target: { value: "scratch.txt" } });
      fireEvent.click(screen.getByTestId("buffer-create-new"));

      const err = await screen.findByTestId(
        "buffer-switcher-validation-error",
      );
      expect(err.textContent).toMatch(/markdown/i);
      expect(
        invokeMock.mock.calls.find((c) => c[0] === "create_note"),
      ).toBeUndefined();
    });

    it("Preview picker accepts a .md filename", async () => {
      const invokeMock = getInvokeMock();
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === "list_notes_all") return Promise.resolve(MOCK_ALL_NOTES);
        if (cmd === "list_notes") return Promise.resolve(MOCK_NOTES);
        if (cmd === "create_note") {
          return Promise.resolve("/project/notes/newone.md");
        }
        return Promise.resolve(undefined);
      });

      render(<BufferSwitcher onClose={() => {}} pickerMode="preview" />);
      await waitFor(() =>
        expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument(),
      );
      const input = screen.getByTestId("buffer-switcher-input");
      fireEvent.change(input, { target: { value: "newone.md" } });
      fireEvent.click(screen.getByTestId("buffer-create-new"));

      await waitFor(() => {
        expect(
          invokeMock.mock.calls.find((c) => c[0] === "create_note"),
        ).toBeDefined();
      });
    });
  });
});
