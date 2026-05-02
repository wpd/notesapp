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

function mountHook(onQuit?: () => void) {
  const onOpenBufferSwitcher = vi.fn();
  const onOpenFindFile = vi.fn();
  const onModeSwitch = vi.fn();
  const quitFn = onQuit ?? vi.fn();
  renderHook(() =>
    useKeyboardShortcuts({ onOpenBufferSwitcher, onOpenFindFile, onModeSwitch, onQuit: quitFn }),
  );
  return { onOpenBufferSwitcher, onOpenFindFile, onModeSwitch, onQuit: quitFn };
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

describe("useKeyboardShortcuts — C-x C-c calls onQuit", () => {
  it("C-x C-c invokes onQuit", () => {
    seedTwoTiles();
    const { onQuit } = mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("c", { ctrlKey: true });
    });

    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("C-x C-c clears the prefix", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true });
      fireKey("c", { ctrlKey: true });
    });

    expect(useLayoutStore.getState().cxPrefixActive).toBe(false);
  });
});

describe("useKeyboardShortcuts — Esc-as-Meta prefix", () => {
  it("Esc then non-modifier key dispatches a synthesized Alt+key on .cm-content", () => {
    seedTwoTiles();
    mountHook();

    // Plant a fake .cm-content element inside editor-pane-tile-a.
    const pane = document.createElement("div");
    pane.setAttribute("data-testid", "editor-pane-tile-a");
    const cm = document.createElement("div");
    cm.className = "cm-content";
    pane.appendChild(cm);
    document.body.appendChild(pane);

    const receivedEvents: KeyboardEvent[] = [];
    cm.addEventListener("keydown", (e) => receivedEvents.push(e));

    act(() => {
      fireKey("Escape");
      fireKey(">");
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].altKey).toBe(true);
    expect(receivedEvents[0].key).toBe(">");

    document.body.removeChild(pane);
  });

  it("Esc prefix does not fire when a C-x prefix is already active", () => {
    seedTwoTiles();
    mountHook();

    act(() => {
      fireKey("x", { ctrlKey: true }); // arm C-x prefix
      fireKey("Escape");               // Esc while C-x prefix active
    });

    // Esc should have consumed the C-x chord (default branch), not armed Esc prefix.
    // cxPrefixActive should be cleared.
    expect(useLayoutStore.getState().cxPrefixActive).toBe(false);
  });

  it("Esc prefix clears on a second Esc (treated as cancel)", () => {
    seedTwoTiles();
    mountHook();

    const pane = document.createElement("div");
    pane.setAttribute("data-testid", "editor-pane-tile-a");
    const cm = document.createElement("div");
    cm.className = "cm-content";
    pane.appendChild(cm);
    document.body.appendChild(pane);

    const receivedEvents: KeyboardEvent[] = [];
    cm.addEventListener("keydown", (e) => receivedEvents.push(e));

    act(() => {
      fireKey("Escape");
      fireKey("Escape"); // cancel the prefix
    });

    // No synthesized event should have been dispatched.
    expect(receivedEvents.length).toBe(0);

    document.body.removeChild(pane);
  });

  it("Esc does not arm prefix when a modal dialog is open", () => {
    seedTwoTiles();
    mountHook();

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    const pane = document.createElement("div");
    pane.setAttribute("data-testid", "editor-pane-tile-a");
    const cm = document.createElement("div");
    cm.className = "cm-content";
    pane.appendChild(cm);
    document.body.appendChild(pane);

    const receivedEvents: KeyboardEvent[] = [];
    cm.addEventListener("keydown", (e) => receivedEvents.push(e));

    act(() => {
      fireKey("Escape");
      fireKey(">");
    });

    expect(receivedEvents.length).toBe(0);

    document.body.removeChild(dialog);
    document.body.removeChild(pane);
  });
});
