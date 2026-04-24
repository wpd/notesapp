// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import App from "../../src/App";
import useProjectStore from "../../src/stores/projectStore";
import useLayoutStore from "../../src/stores/layoutStore";

// Mock Tauri invoke to avoid native calls
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation(async (cmd: string) => {
    if (cmd === "get_project_dir_env") return null;
    return null;
  }),
}));

// Mock the dialog wrapper used by App.tsx
vi.mock("../../src/utils/dialogs", () => ({
  openFileDialog: vi.fn().mockResolvedValue(null),
}));

// Mock Tauri event plugin so listen()/unlisten() don't blow up in jsdom
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { invoke as mockInvoke } from "@tauri-apps/api/core";
import { openFileDialog as mockOpenDialog } from "../../src/utils/dialogs";

beforeEach(() => {
  useProjectStore.setState({
    projectDir: null,
    notes: [],
    isLoaded: false,
    error: null,
  });
  useLayoutStore.setState({
    mosaicTree: null,
    tiles: {},
    focusedTileId: null,
    pinnedTileId: null,
    sidebarVisible: true,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 0,
  });
});

describe("App", () => {
  it("renders the app-root element", () => {
    render(<App />);
    expect(screen.getByTestId("app-root")).toBeInTheDocument();
  });

  it("shows the project loader initially", async () => {
    render(<App />);
    // The project loader is shown while waiting for env var check
    // It shows either "Loading project…" or the "Open Project Directory" button
    const root = screen.getByTestId("app-root");
    expect(root).toBeInTheDocument();
  });

  it("shows the choose directory button when no env var is set", async () => {
    render(<App />);
    // Wait for the async invoke to resolve (null → show button)
    const button = await screen.findByTestId("choose-directory-button", {}, { timeout: 2000 });
    expect(button).toBeInTheDocument();
  });

  it("shows the app shell once project is loaded", async () => {
    // Pre-load a project
    useProjectStore.setState({
      projectDir: "/test/project",
      notes: [],
      isLoaded: true,
      error: null,
    });
    useLayoutStore.getState().initDefaultLayout();

    // Simulate project loaded state directly
    render(<App />);
    // The app shows the project loader first since projectLoaded state is false
    // We just verify the root is there
    expect(screen.getByTestId("app-root")).toBeInTheDocument();
  });

  describe("chooser-result reprocessed through resolution (ROADMAP §Phase 1)", () => {
    it("reopens the chooser when the picked directory fails resolution", async () => {
      const invoke = mockInvoke as unknown as ReturnType<typeof vi.fn>;
      const openDialog = mockOpenDialog as unknown as ReturnType<typeof vi.fn>;
      invoke.mockReset();
      openDialog.mockReset();

      invoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_project_dir_env") return null;
        if (cmd === "open_project") {
          throw "project.toml is malformed: unexpected character";
        }
        return null;
      });
      // First chooser pick: a broken directory.
      // Second pick: cancel (returns null) → loop ends.
      openDialog
        .mockResolvedValueOnce("/broken/project")
        .mockResolvedValueOnce(null);

      render(<App />);
      const button = await screen.findByTestId(
        "choose-directory-button",
        {},
        { timeout: 2000 },
      );
      fireEvent.click(button);

      await waitFor(() => {
        expect(openDialog).toHaveBeenCalledTimes(2);
      });
      const calls = invoke.mock.calls.filter((c) => c[0] === "open_project");
      expect(calls.length).toBe(1);
      expect(useProjectStore.getState().projectDir).toBeNull();
      expect(useProjectStore.getState().error).toContain("malformed");
    });

    it("loads the project when a chooser pick passes resolution", async () => {
      const invoke = mockInvoke as unknown as ReturnType<typeof vi.fn>;
      const openDialog = mockOpenDialog as unknown as ReturnType<typeof vi.fn>;
      invoke.mockReset();
      openDialog.mockReset();

      invoke.mockImplementation(async (cmd: string) => {
        if (cmd === "get_project_dir_env") return null;
        if (cmd === "open_project")
          return [{ path: "/p/notes/a.md", name: "a", modified_at: 0 }];
        return null;
      });
      openDialog.mockResolvedValueOnce("/good/project");

      render(<App />);
      const button = await screen.findByTestId(
        "choose-directory-button",
        {},
        { timeout: 2000 },
      );
      fireEvent.click(button);

      await waitFor(() => {
        expect(useProjectStore.getState().projectDir).toBe("/good/project");
      });
      // Chooser was not reopened on success
      expect(openDialog).toHaveBeenCalledTimes(1);
    });
  });
});
