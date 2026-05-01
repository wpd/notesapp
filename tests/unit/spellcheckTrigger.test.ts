// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { spellcheckTrigger, SpellcheckTrigger } from "../../src/utils/spellcheckTrigger";
import { spellingDecorations } from "../../src/utils/spellingDecorations";

// Mock @tauri-apps/api/core so invoke() resolves immediately in jsdom.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

// Build a minimal ViewUpdate mock with only the fields SpellcheckTrigger reads.
function mockUpdate(opts: {
  docLength: number;
  prevDocLength?: number;
  contentDOM?: HTMLElement;
}): ViewUpdate {
  const el = opts.contentDOM ?? document.createElement("div");
  return {
    docChanged: opts.prevDocLength !== undefined
      ? opts.docLength !== opts.prevDocLength
      : opts.docLength > 0,
    viewportChanged: false,
    state: { doc: { length: opts.docLength, toString: () => "mock content" } },
    view: {
      contentDOM: el,
      dispatch: vi.fn(),
      state: { doc: { length: opts.docLength, toString: () => "mock content" } },
    },
  } as unknown as ViewUpdate;
}

// Build a minimal EditorView mock for the SpellcheckTrigger constructor.
function mockView(docLength: number, el?: HTMLElement): EditorView {
  return {
    state: { doc: { length: docLength, toString: () => "mock content" } },
    contentDOM: el ?? document.createElement("div"),
    dispatch: vi.fn(),
  } as unknown as EditorView;
}

function makeView(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown(), spellcheckTrigger, spellingDecorations],
  });
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

// SpellcheckTrigger calls invoke("check_spelling") on all platforms.
// The mock returns [] here; the Rust backend provides real ranges in production.
describe("spellcheckTrigger", () => {
  let view: EditorView;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (view) {
      view.destroy();
      view.dom.parentElement?.remove();
    }
  });

  describe("initial load trigger", () => {
    it("calls check_spelling when the document is first populated", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      view = makeView("");

      view.dispatch({
        changes: { from: 0, to: 0, insert: "teh quikc brown fox" },
      });

      // invoke is async; wait for the microtask queue to drain.
      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("check_spelling", {
          text: "teh quikc brown fox",
        });
      });
    });

    it("does not call check_spelling on subsequent edits after load", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      view = makeView("");

      // First population triggers the check.
      view.dispatch({ changes: { from: 0, to: 0, insert: "hello world" } });
      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      vi.clearAllMocks();

      // A normal user edit after load must NOT re-trigger.
      view.dispatch({ changes: { from: 11, to: 11, insert: " more text" } });
      await new Promise((r) => setTimeout(r, 20));
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls check_spelling immediately when the editor starts with pre-loaded content", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      view = makeView("already loaded content");

      // The constructor fires an immediate check for pre-loaded content (buffer
      // switcher pre-populates the Y.Doc before switching the tile).
      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("check_spelling", {
          text: "already loaded content",
        });
      });
      vi.clearAllMocks();

      // A subsequent edit should NOT re-trigger immediately (relies on debounce).
      view.dispatch({ changes: { from: 0, to: 0, insert: "x" } });
      await new Promise((r) => setTimeout(r, 20));
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("debounced re-check after edits", () => {
    it("schedules a re-check when the document changes after load", async () => {
      vi.useFakeTimers();
      const { invoke } = await import("@tauri-apps/api/core");
      view = makeView("");

      // Initial load
      view.dispatch({ changes: { from: 0, to: 0, insert: "hello world" } });
      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      vi.clearAllMocks();

      // A subsequent edit should schedule a re-check
      view.dispatch({ changes: { from: 5, to: 5, insert: "!" } });
      expect(invoke).not.toHaveBeenCalled(); // not yet

      await vi.runAllTimersAsync();
      expect(invoke).toHaveBeenCalledWith("check_spelling", expect.objectContaining({ text: expect.any(String) }));

      vi.useRealTimers();
    });

    it("debounces rapid edits into a single re-check", async () => {
      vi.useFakeTimers();
      const { invoke } = await import("@tauri-apps/api/core");
      view = makeView("");

      view.dispatch({ changes: { from: 0, to: 0, insert: "hello" } });
      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      vi.clearAllMocks();

      // Three rapid edits
      view.dispatch({ changes: { from: 5, to: 5, insert: " " } });
      view.dispatch({ changes: { from: 6, to: 6, insert: "w" } });
      view.dispatch({ changes: { from: 7, to: 7, insert: "o" } });

      await vi.runAllTimersAsync();
      expect(invoke).toHaveBeenCalledTimes(1); // collapsed into one call

      vi.useRealTimers();
    });
  });

  describe("destroy", () => {
    it("cancels the pending recheck timer on destroy", () => {
      vi.useFakeTimers();
      const clearSpy = vi.spyOn(globalThis, "clearTimeout");
      const el = document.createElement("div");
      const plugin = new SpellcheckTrigger(mockView(0, el));

      // Trigger load check then a subsequent edit to arm the debounce timer.
      plugin.update(mockUpdate({ docLength: 5, prevDocLength: 0, contentDOM: el }));
      plugin.update({ ...mockUpdate({ docLength: 6, prevDocLength: 5, contentDOM: el }), docChanged: true } as ViewUpdate);

      plugin.destroy();
      expect(clearSpy).toHaveBeenCalled();

      clearSpy.mockRestore();
      vi.useRealTimers();
    });

    it("prevents dispatch after the plugin is destroyed", async () => {
      const el = document.createElement("div");
      const dispatchMock = vi.fn();
      const viewMock = {
        state: { doc: { length: 0, toString: () => "" } },
        contentDOM: el,
        dispatch: dispatchMock,
      } as unknown as EditorView;

      const plugin = new SpellcheckTrigger(viewMock);
      plugin.update({
        docChanged: true,
        viewportChanged: false,
        state: { doc: { length: 5, toString: () => "hello" } },
        view: viewMock,
      } as unknown as ViewUpdate);

      plugin.destroy();
      await new Promise((r) => setTimeout(r, 20));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });
});
