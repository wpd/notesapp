// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import TileBar from "../../src/components/TileBar";
import useLayoutStore from "../../src/stores/layoutStore";

// Reset layout store before each test
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
  });
});

describe("TileBar", () => {
  it("renders the file name", () => {
    render(
      <TileBar
        tileId="editor-1"
        type="editor"
        filePath="/project/notes/hello.md"
      />,
    );
    expect(screen.getByTestId("tile-title-text-editor-1")).toBeInTheDocument();
    expect(screen.getByText("hello.md")).toBeInTheDocument();
  });

  it("renders (no file) when filePath is null", () => {
    render(<TileBar tileId="editor-1" type="editor" filePath={null} />);
    expect(screen.getByText("(no file)")).toBeInTheDocument();
  });

  it("shows correct pane type badge for editor", () => {
    render(<TileBar tileId="editor-1" type="editor" filePath={null} />);
    expect(screen.getByTestId("tile-type-badge-editor-1")).toHaveTextContent(
      "Editor",
    );
  });

  it("shows correct pane type badge for preview", () => {
    render(<TileBar tileId="preview-1" type="preview" filePath={null} />);
    expect(screen.getByTestId("tile-type-badge-preview-1")).toHaveTextContent(
      "Preview",
    );
  });

  it("shows pin icon on editor tiles", () => {
    render(<TileBar tileId="editor-1" type="editor" filePath={null} />);
    expect(screen.getByTestId("tile-pin-editor-1")).toBeInTheDocument();
  });

  it("does NOT show pin icon on preview tiles", () => {
    render(<TileBar tileId="preview-1" type="preview" filePath={null} />);
    expect(
      screen.queryByTestId("tile-pin-preview-1"),
    ).not.toBeInTheDocument();
  });

  it("shows split-h and split-v buttons", () => {
    render(<TileBar tileId="editor-1" type="editor" filePath={null} />);
    expect(screen.getByTestId("tile-split-h-editor-1")).toBeInTheDocument();
    expect(screen.getByTestId("tile-split-v-editor-1")).toBeInTheDocument();
  });

  it("shows maximize button", () => {
    render(<TileBar tileId="editor-1" type="editor" filePath={null} />);
    expect(screen.getByTestId("tile-maximize-editor-1")).toBeInTheDocument();
  });

  it("does not show close button when only one tile", () => {
    // mosaicTree is null, so leavesCount = 1 → no close
    render(<TileBar tileId="editor-1" type="editor" filePath={null} />);
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
        "editor-1": { id: "editor-1", type: "editor", filePath: null },
        "preview-1": { id: "preview-1", type: "preview", filePath: null },
      },
    });
    render(<TileBar tileId="editor-1" type="editor" filePath={null} />);
    expect(screen.getByTestId("tile-close-editor-1")).toBeInTheDocument();
  });

  it("shows dirty indicator when tile is dirty", async () => {
    const editorStoreModule = await import("../../src/stores/editorStore");
    const editorStore = editorStoreModule.default;
    editorStore.setState({ dirtyStates: { "editor-1": true } });

    render(
      <TileBar tileId="editor-1" type="editor" filePath="/notes/test.md" />,
    );
    expect(
      screen.getByTestId("dirty-indicator-editor-1"),
    ).toBeInTheDocument();
  });

  it("pin button toggles pin state", () => {
    useLayoutStore.setState({
      mosaicTree: "editor-1",
      tiles: { "editor-1": { id: "editor-1", type: "editor", filePath: null } },
      pinnedTileId: null,
    });
    render(<TileBar tileId="editor-1" type="editor" filePath={null} />);
    const pinBtn = screen.getByTestId("tile-pin-editor-1");
    fireEvent.click(pinBtn);
    expect(useLayoutStore.getState().pinnedTileId).toBe("editor-1");
  });
});
