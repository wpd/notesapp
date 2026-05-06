// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { emacs } from "@replit/codemirror-emacs";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { useKeyboardShortcuts } from "../../src/hooks/useKeyboardShortcuts";
import useLayoutStore from "../../src/stores/layoutStore";
import {
  registerEditorView,
  unregisterEditorView,
} from "../../src/editor/editorViewRegistry";
import {
  registerWysiwygEditor,
  unregisterWysiwygEditor,
} from "../../src/editor/wysiwygRegistry";

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
    tileFontScale: {},
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

/** Create a real CodeMirror EditorView with emacs() extension attached to a DOM div. */
function createEmacsView(doc: string): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({ doc, extensions: [emacs()] }),
    parent,
  });
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

describe("useKeyboardShortcuts — Esc-as-Meta prefix (direct command dispatch)", () => {
  let view: EditorView;

  beforeEach(() => {
    seedTwoTiles();
    view = createEmacsView("hello\nworld");
    registerEditorView("tile-a", view);
  });

  afterEach(() => {
    unregisterEditorView("tile-a");
    view.dom.parentElement?.remove();
    view.destroy();
  });

  it("Esc > moves cursor to end of document", () => {
    mountHook();

    act(() => {
      fireKey("Escape");
      fireKey(">");
    });

    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("Esc < moves cursor to beginning of document", () => {
    // First go to end so the assertion is meaningful.
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    mountHook();

    act(() => {
      fireKey("Escape");
      fireKey("<");
    });

    expect(view.state.selection.main.head).toBe(0);
  });

  it("Esc prefix does not fire when a C-x prefix is already active", () => {
    mountHook();
    const initialHead = view.state.selection.main.head;

    act(() => {
      fireKey("x", { ctrlKey: true }); // arm C-x prefix
      fireKey("Escape");               // Esc while C-x prefix active
    });

    // Esc should have consumed the C-x chord (default branch), not armed Esc prefix.
    // cxPrefixActive should be cleared and cursor should not have moved.
    expect(useLayoutStore.getState().cxPrefixActive).toBe(false);
    expect(view.state.selection.main.head).toBe(initialHead);
  });

  it("second Esc cancels the prefix — no cursor movement", () => {
    mountHook();
    const initialHead = view.state.selection.main.head;

    act(() => {
      fireKey("Escape");
      fireKey("Escape"); // cancel the prefix
    });

    expect(view.state.selection.main.head).toBe(initialHead);
  });

  it("Esc does not arm prefix when a modal dialog is open", () => {
    mountHook();
    const initialHead = view.state.selection.main.head;

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    act(() => {
      fireKey("Escape");
      fireKey(">");
    });

    expect(view.state.selection.main.head).toBe(initialHead);

    document.body.removeChild(dialog);
  });
});

describe("useKeyboardShortcuts — Esc-as-Meta prefix routes to WYSIWYG editor", () => {
  // Use a mock Tiptap editor to avoid DOM-cleanup issues with real Tiptap in jsdom.
  // Actual cursor behaviour is verified in wysiwygEmacsKeymap.test.ts.
  let focusMock: ReturnType<typeof vi.fn>;
  let mockEditor: TiptapEditor;

  beforeEach(() => {
    focusMock = vi.fn();
    // Minimal mock that satisfies the MetaEntry.tt call signatures.
    mockEditor = {
      commands: { focus: focusMock, undo: vi.fn() },
      state: {
        doc: { content: { size: 20 } },
        selection: { head: 5 },
      },
      view: { state: { doc: {}, selection: { head: 5 } }, dispatch: vi.fn() },
    } as unknown as TiptapEditor;

    // Seed tiles: tile-a = editor, tile-b = preview. Focus tile-b.
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
      focusedTileId: "tile-b",
    });
    registerWysiwygEditor("tile-b", mockEditor);
  });

  afterEach(() => {
    unregisterWysiwygEditor("tile-b");
  });

  it("Esc > calls focus('end') on the Tiptap editor when tile is preview", () => {
    mountHook();

    act(() => {
      fireKey("Escape");
      fireKey(">");
    });

    expect(focusMock).toHaveBeenCalledWith("end");
  });

  it("Esc < calls focus('start') on the Tiptap editor when tile is preview", () => {
    mountHook();

    act(() => {
      fireKey("Escape");
      fireKey("<");
    });

    expect(focusMock).toHaveBeenCalledWith("start");
  });

  it("Esc f calls wordForwardTiptap (no throw) when tile is preview", () => {
    mountHook();

    // wordForwardTiptap calls selectionModify which is a no-op in jsdom — just
    // verify the branch is reached without throwing.
    expect(() => {
      act(() => {
        fireKey("Escape");
        fireKey("f");
      });
    }).not.toThrow();
  });

  it("Esc-prefix CodeMirror path still works on editor tiles (regression)", () => {
    // Focus the editor tile (tile-a) and register a CodeMirror view.
    useLayoutStore.setState({ focusedTileId: "tile-a" });
    const cmParent = document.createElement("div");
    document.body.appendChild(cmParent);
    const view = new EditorView({
      state: EditorState.create({ doc: "hello\nworld", extensions: [emacs()] }),
      parent: cmParent,
    });
    registerEditorView("tile-a", view);

    mountHook();
    act(() => {
      fireKey("Escape");
      fireKey(">");
    });

    expect(view.state.selection.main.head).toBe(view.state.doc.length);

    unregisterEditorView("tile-a");
    view.destroy();
    cmParent.remove();
  });
});

describe("useKeyboardShortcuts — Ctrl+=/-/0 font size", () => {
  beforeEach(() => {
    seedTwoTiles();
  });

  it("Ctrl+= calls incrementTileFontScale on the focused tile", () => {
    mountHook();
    act(() => { fireKey("=", { ctrlKey: true }); });
    expect(useLayoutStore.getState().tileFontScale["tile-a"]).toBeCloseTo(1.1);
  });

  it("Ctrl+- calls decrementTileFontScale on the focused tile", () => {
    mountHook();
    act(() => { fireKey("-", { ctrlKey: true }); });
    expect(useLayoutStore.getState().tileFontScale["tile-a"]).toBeCloseTo(0.9);
  });

  it("Ctrl+0 calls resetTileFontScale on the focused tile", () => {
    useLayoutStore.setState({ tileFontScale: { "tile-a": 1.5 } });
    mountHook();
    act(() => { fireKey("0", { ctrlKey: true }); });
    expect(useLayoutStore.getState().tileFontScale["tile-a"]).toBeUndefined();
  });

  it("Ctrl+= calls preventDefault", () => {
    mountHook();
    const event = new KeyboardEvent("keydown", { key: "=", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+- does not fire when C-x prefix is active", () => {
    mountHook();
    act(() => { fireKey("x", { ctrlKey: true }); }); // arm C-x prefix
    act(() => { fireKey("-", { ctrlKey: true }); }); // C-x C-- is unknown chord, clears prefix
    // tileFontScale should remain untouched
    expect(useLayoutStore.getState().tileFontScale["tile-a"]).toBeUndefined();
  });
});
