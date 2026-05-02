// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts } from "../../src/hooks/useKeyboardShortcuts";
import useLayoutStore from "../../src/stores/layoutStore";

// Stub @tauri-apps/api/core so invoke() resolves immediately in jsdom.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

// Reset relevant store state before each test.
function resetStore() {
  useLayoutStore.setState({
    mosaicTree: null,
    tiles: {},
    focusedTileId: null,
    pinnedTileId: null,
    sidebarVisible: true,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 0,
    pendingDialog: null,
    cxPrefixActive: false,
    wordWrap: {},
  });
}

/** Seed the store with two tiles in reading order: [tile-a, tile-b] */
function seedTwoTiles() {
  const treeNode = {
    direction: "row" as const,
    first: "tile-a",
    second: "tile-b",
    splitPercentage: 50,
  };
  useLayoutStore.setState({
    mosaicTree: treeNode,
    tiles: {
      "tile-a": { id: "tile-a", mode: "editor", filePath: "/notes/a.md" },
      "tile-b": { id: "tile-b", mode: "preview", filePath: "/notes/a.md" },
    },
    focusedTileId: "tile-a",
  });
}

/** Fire a keydown event on document and return the event object. */
function fireKey(key: string, opts: { ctrlKey?: boolean; shiftKey?: boolean } = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
  });
  document.dispatchEvent(event);
  return event;
}

function mountHook() {
  const onOpenBufferSwitcher = vi.fn();
  const onOpenFindFile = vi.fn();
  const onModeSwitch = vi.fn();
  renderHook(() =>
    useKeyboardShortcuts({ onOpenBufferSwitcher, onOpenFindFile, onModeSwitch }),
  );
  return { onOpenBufferSwitcher, onOpenFindFile, onModeSwitch };
}

beforeEach(() => {
  resetStore();
});

describe("useKeyboardShortcuts — C-x N tile focus", () => {
  it("C-x 1 focuses the first tile in reading order", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("1");
    });

    expect(useLayoutStore.getState().focusedTileId).toBe("tile-a");
  });

  it("C-x 2 focuses the second tile in reading order", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("2");
    });

    expect(useLayoutStore.getState().focusedTileId).toBe("tile-b");
  });

  it("C-x 9 with only 2 tiles is a no-op (no crash, focus unchanged)", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("9");
    });

    // Focus should remain on tile-a (unchanged from seed).
    expect(useLayoutStore.getState().focusedTileId).toBe("tile-a");
  });

  it("C-x N preventDefault is called on the digit key", () => {
    seedTwoTiles();
    mountHook();

    act(() => { fireKey("x", { ctrlKey: true }); });
    const digitEvent = new KeyboardEvent("keydown", {
      key: "2",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(digitEvent);

    expect(digitEvent.defaultPrevented).toBe(true);
  });
});

describe("useKeyboardShortcuts — cxPrefixActive store flag", () => {
  it("C-x sets cxPrefixActive to true", () => {
    seedTwoTiles();
    mountHook();

    act(() => { fireKey("x", { ctrlKey: true }); });

    expect(useLayoutStore.getState().cxPrefixActive).toBe(true);
  });

  it("cxPrefixActive clears after a recognised chord (C-x o)", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("o");
    });

    expect(useLayoutStore.getState().cxPrefixActive).toBe(false);
  });

  it("cxPrefixActive clears after C-x 2", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("2");
    });

    expect(useLayoutStore.getState().cxPrefixActive).toBe(false);
  });

  it("cxPrefixActive clears after an unrecognised chord (C-x q)", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("q");
    });

    expect(useLayoutStore.getState().cxPrefixActive).toBe(false);
  });
});

describe("useKeyboardShortcuts — unrecognised C-x chord does not leak into buffer", () => {
  it("C-x q calls preventDefault on the unrecognised key", () => {
    seedTwoTiles();
    mountHook();

    act(() => { fireKey("x", { ctrlKey: true }); });
    const unrecognisedEvent = new KeyboardEvent("keydown", {
      key: "q",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(unrecognisedEvent);

    expect(unrecognisedEvent.defaultPrevented).toBe(true);
  });

  it("C-x j calls preventDefault on the unrecognised key", () => {
    seedTwoTiles();
    mountHook();

    act(() => { fireKey("x", { ctrlKey: true }); });
    const event = new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("C-x n z (unrecognised C-x n sub-key) calls preventDefault", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("n");
    });

    const event = new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("after C-x q the prefix is cleared so a subsequent key is handled normally", () => {
    seedTwoTiles();
    mountHook();

    // Consume a C-x chord with an unrecognised key.
    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("q");
    });

    // cxPrefixActive must be false — the prefix has been cleared.
    expect(useLayoutStore.getState().cxPrefixActive).toBe(false);
  });
});
