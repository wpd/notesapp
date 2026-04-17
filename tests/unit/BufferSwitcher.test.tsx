// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import BufferSwitcher from "../../src/components/BufferSwitcher";
import useProjectStore from "../../src/stores/projectStore";
import useLayoutStore from "../../src/stores/layoutStore";

const MOCK_NOTES = [
  { path: "/project/notes/alpha.md", name: "alpha", modified_at: 3 },
  { path: "/project/notes/beta.md", name: "beta", modified_at: 2 },
  { path: "/project/notes/gamma.md", name: "gamma", modified_at: 1 },
];

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
      "editor-1": { id: "editor-1", type: "editor", filePath: null },
    },
    mosaicTree: "editor-1",
    pinnedTileId: null,
    sidebarVisible: true,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 0,
  });
});

describe("BufferSwitcher", () => {
  it("renders the input and list", () => {
    render(<BufferSwitcher onClose={() => {}} />);
    expect(screen.getByTestId("buffer-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-switcher-input")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-switcher-list")).toBeInTheDocument();
  });

  it("shows all notes when query is empty", () => {
    render(<BufferSwitcher onClose={() => {}} />);
    expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-item-beta")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-item-gamma")).toBeInTheDocument();
  });

  it("filters notes by query", () => {
    render(<BufferSwitcher onClose={() => {}} />);
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "al" } });
    expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
    expect(screen.queryByTestId("buffer-item-beta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("buffer-item-gamma")).not.toBeInTheDocument();
  });

  it("is case-insensitive in filtering", () => {
    render(<BufferSwitcher onClose={() => {}} />);
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "ALPHA" } });
    expect(screen.getByTestId("buffer-item-alpha")).toBeInTheDocument();
  });

  it("shows 'No matching notes' when filter matches nothing (buffer mode)", () => {
    render(<BufferSwitcher onClose={() => {}} mode="buffer" />);
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "zzznomatch" } });
    expect(screen.getByText("No matching notes")).toBeInTheDocument();
  });

  it("shows 'Create new note' row in find-file mode when query has no exact match", () => {
    render(<BufferSwitcher onClose={() => {}} mode="find-file" />);
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "newname" } });
    expect(screen.getByTestId("buffer-create-new")).toBeInTheDocument();
    expect(screen.getByTestId("buffer-create-new").textContent).toContain(
      "newname",
    );
  });

  it("does NOT show create row in buffer mode", () => {
    render(<BufferSwitcher onClose={() => {}} mode="buffer" />);
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "newname" } });
    expect(screen.queryByTestId("buffer-create-new")).not.toBeInTheDocument();
  });

  it("does NOT show create row in find-file mode when query matches an existing note", () => {
    render(<BufferSwitcher onClose={() => {}} mode="find-file" />);
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(screen.queryByTestId("buffer-create-new")).not.toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<BufferSwitcher onClose={onClose} />);
    const input = screen.getByTestId("buffer-switcher-input");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when overlay background is clicked", () => {
    const onClose = vi.fn();
    render(<BufferSwitcher onClose={onClose} />);
    fireEvent.click(screen.getByTestId("buffer-switcher-overlay"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ArrowDown / ArrowUp navigate the list", () => {
    render(<BufferSwitcher onClose={() => {}} />);
    const input = screen.getByTestId("buffer-switcher-input");

    // Initially first item is selected (idx=0 → alpha has accent background)
    const alpha = screen.getByTestId("buffer-item-alpha");
    const beta = screen.getByTestId("buffer-item-beta");

    // alpha starts selected — it has the accent-muted background
    // jsdom doesn't resolve CSS variables, so check the inline style string contains accent-muted
    expect(alpha.style.background).toContain("accent-muted");
    expect(beta.style.background).not.toContain("accent-muted");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(beta.style.background).toContain("accent-muted");
    expect(alpha.style.background).not.toContain("accent-muted");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(alpha.style.background).toContain("accent-muted");
  });
});
