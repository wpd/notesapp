// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import TileBar from "../../src/components/TileBar";
import useLayoutStore from "../../src/stores/layoutStore";

beforeEach(() => {
  useLayoutStore.setState({
    mosaicTree: null,
    tiles: {},
    focusedTileId: null,
    pinnedTileId: null,
    sidebarVisible: true,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 0,
    statusMessage: null,
  });
});

describe("TileBar", () => {
  it("renders the file name", () => {
    render(
      <TileBar
        tileId="editor-1"
        mode="editor"
        filePath="/project/notes/hello.md"
      />,
    );
    expect(screen.getByTestId("tile-title-text-editor-1")).toBeInTheDocument();
    expect(screen.getByText("hello.md")).toBeInTheDocument();
  });

  it("renders (no file) when filePath is null", () => {
    render(<TileBar tileId="editor-1" mode="editor" filePath={null} />);
    expect(screen.getByText("(no file)")).toBeInTheDocument();
  });

  it("shows mode indicator for editor", () => {
    render(<TileBar tileId="editor-1" mode="editor" filePath={null} />);
    expect(screen.getByTestId("tile-mode-indicator-editor-1")).toHaveTextContent(
      "Editor",
    );
  });

  it("shows mode indicator for preview", () => {
    render(<TileBar tileId="preview-1" mode="preview" filePath={null} />);
    expect(screen.getByTestId("tile-mode-indicator-preview-1")).toHaveTextContent(
      "Preview",
    );
  });

  it("shows mode indicator for missing", () => {
    render(
      <TileBar
        tileId="missing-1"
        mode="missing"
        filePath={null}
        missingPath="/notes/gone.md"
      />,
    );
    expect(screen.getByTestId("tile-mode-indicator-missing-1")).toHaveTextContent(
      "Missing",
    );
  });

  it("mode indicator is clickable toggle on editor tiles with .md file", () => {
    render(
      <TileBar tileId="editor-1" mode="editor" filePath="/notes/test.md" />,
    );
    const indicator = screen.getByTestId("tile-mode-indicator-editor-1");
    expect(indicator).not.toBeDisabled();
  });

  it("mode indicator is disabled on editor tiles with non-.md file", () => {
    render(
      <TileBar tileId="editor-1" mode="editor" filePath="/notes/test.txt" />,
    );
    const indicator = screen.getByTestId("tile-mode-indicator-editor-1");
    // Should have reduced opacity (toggle disabled)
    expect(indicator).not.toBeDisabled();
  });

  it("mode indicator is disabled on missing tiles", () => {
    render(
      <TileBar tileId="missing-1" mode="missing" filePath={null} missingPath="/notes/gone.md" />,
    );
    const indicator = screen.getByTestId("tile-mode-indicator-missing-1");
    expect(indicator).toBeDisabled();
  });

  it("shows pin icon on editor tiles", () => {
    render(<TileBar tileId="editor-1" mode="editor" filePath={null} />);
    expect(screen.getByTestId("tile-pin-editor-1")).toBeInTheDocument();
  });

  it("does NOT show pin icon on preview tiles", () => {
    render(<TileBar tileId="preview-1" mode="preview" filePath={null} />);
    expect(
      screen.queryByTestId("tile-pin-preview-1"),
    ).not.toBeInTheDocument();
  });

  it("does NOT show pin icon on missing tiles", () => {
    render(
      <TileBar tileId="missing-1" mode="missing" filePath={null} missingPath="/notes/gone.md" />,
    );
    expect(
      screen.queryByTestId("tile-pin-missing-1"),
    ).not.toBeInTheDocument();
  });

  it("shows split-h and split-v buttons", () => {
    render(<TileBar tileId="editor-1" mode="editor" filePath={null} />);
    expect(screen.getByTestId("tile-split-h-editor-1")).toBeInTheDocument();
    expect(screen.getByTestId("tile-split-v-editor-1")).toBeInTheDocument();
  });

  it("shows maximize button", () => {
    render(<TileBar tileId="editor-1" mode="editor" filePath={null} />);
    expect(screen.getByTestId("tile-maximize-editor-1")).toBeInTheDocument();
  });

  it("does not show close button when only one tile", () => {
    render(<TileBar tileId="editor-1" mode="editor" filePath={null} />);
    expect(
      screen.queryByTestId("tile-close-editor-1"),
    ).not.toBeInTheDocument();
  });

  it("shows close button when multiple tiles exist", () => {
    useLayoutStore.setState({
      mosaicTree: {
        direction: "row",
        first: "editor-1",
        second: "preview-1",
        splitPercentage: 50,
      },
      tiles: {
        "editor-1": { id: "editor-1", mode: "editor", filePath: null },
        "preview-1": { id: "preview-1", mode: "preview", filePath: null },
      },
    });
    render(<TileBar tileId="editor-1" mode="editor" filePath={null} />);
    expect(screen.getByTestId("tile-close-editor-1")).toBeInTheDocument();
  });

  it("shows dirty indicator when tile is dirty", async () => {
    const editorStoreModule = await import("../../src/stores/editorStore");
    const editorStore = editorStoreModule.default;
    editorStore.setState({ dirtyStates: { "editor-1": true } });

    render(
      <TileBar tileId="editor-1" mode="editor" filePath="/notes/test.md" />,
    );
    expect(
      screen.getByTestId("dirty-indicator-editor-1"),
    ).toBeInTheDocument();
  });

  it("no dirty indicator on missing tiles", async () => {
    const editorStoreModule = await import("../../src/stores/editorStore");
    const editorStore = editorStoreModule.default;
    editorStore.setState({ dirtyStates: { "missing-1": true } });

    render(
      <TileBar tileId="missing-1" mode="missing" filePath={null} missingPath="/notes/gone.md" />,
    );
    expect(
      screen.queryByTestId("dirty-indicator-missing-1"),
    ).not.toBeInTheDocument();
  });

  it("shows buffer dropdown button when onOpenPicker is provided", () => {
    render(
      <TileBar
        tileId="editor-1"
        mode="editor"
        filePath="/notes/test.md"
        onOpenPicker={() => {}}
      />,
    );
    expect(screen.getByTestId("tile-buffer-dropdown-editor-1")).toBeInTheDocument();
  });

  it("no buffer dropdown on missing tiles", () => {
    render(
      <TileBar tileId="missing-1" mode="missing" filePath={null} missingPath="/notes/gone.md" />,
    );
    expect(
      screen.queryByTestId("tile-buffer-dropdown-missing-1"),
    ).not.toBeInTheDocument();
  });

  it("pin button toggles pin state", () => {
    useLayoutStore.setState({
      mosaicTree: "editor-1",
      tiles: { "editor-1": { id: "editor-1", mode: "editor", filePath: null } },
      pinnedTileId: null,
    });
    render(<TileBar tileId="editor-1" mode="editor" filePath={null} />);
    const pinBtn = screen.getByTestId("tile-pin-editor-1");
    fireEvent.click(pinBtn);
    expect(useLayoutStore.getState().pinnedTileId).toBe("editor-1");
  });
});
