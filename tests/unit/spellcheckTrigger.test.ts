// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { spellcheckTrigger, SpellcheckTrigger } from "../../src/utils/spellcheckTrigger";

// Build a minimal ViewUpdate mock with only the fields SpellcheckTrigger reads.
function mockUpdate(opts: {
  docLength: number;
  prevDocLength?: number;
  viewportChanged?: boolean;
  contentDOM?: HTMLElement;
}): ViewUpdate {
  const el = opts.contentDOM ?? document.createElement("div");
  return {
    docChanged: opts.prevDocLength !== undefined
      ? opts.docLength !== opts.prevDocLength
      : opts.docLength > 0,
    viewportChanged: opts.viewportChanged ?? false,
    state: { doc: { length: opts.docLength } },
    view: { contentDOM: el },
  } as unknown as ViewUpdate;
}

// Build a minimal EditorView mock for the SpellcheckTrigger constructor.
function mockView(docLength: number, el?: HTMLElement): EditorView {
  return {
    state: { doc: { length: docLength } },
    contentDOM: el ?? document.createElement("div"),
  } as unknown as EditorView;
}

function makeView(doc: string): EditorView {
  const state = EditorState.create({ doc, extensions: [markdown(), spellcheckTrigger] });
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

describe("spellcheckTrigger", () => {
  let view: EditorView;
  let rafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Capture requestAnimationFrame calls so we can assert they were made
    // without waiting for actual animation frames in jsdom.
    rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    if (view) {
      view.destroy();
      view.dom.parentElement?.remove();
    }
    rafSpy.mockRestore();
    vi.useRealTimers();
  });

  describe("initial load trigger", () => {
    it("triggers a spellcheck re-scan when the document is first populated", () => {
      // Create editor with empty doc (simulates async load not yet complete).
      view = makeView("");
      rafSpy.mockClear();

      // Simulate yCollab populating the editor (empty → non-empty).
      view.dispatch({
        changes: { from: 0, to: 0, insert: "teh quikc brown fox" },
      });

      // retriggerSpellcheck removes the attribute and calls rAF to re-add it.
      expect(rafSpy).toHaveBeenCalledTimes(1);
      // After rAF executes (mocked synchronously), spellcheck should be "true".
      expect(view.contentDOM.getAttribute("spellcheck")).toBe("true");
    });

    it("does not re-trigger on subsequent edits (only on the empty→non-empty transition)", () => {
      view = makeView("");
      // First population
      view.dispatch({ changes: { from: 0, to: 0, insert: "hello world" } });
      rafSpy.mockClear();

      // A normal user edit after load — must NOT re-trigger the full rescan.
      view.dispatch({ changes: { from: 11, to: 11, insert: " more text" } });
      expect(rafSpy).not.toHaveBeenCalled();
    });

    it("does not trigger when the editor is created with content already present", () => {
      // When the doc is non-empty at creation time there is no 0→N transition.
      view = makeView("already loaded content");
      rafSpy.mockClear();

      // A normal edit — no trigger expected.
      view.dispatch({ changes: { from: 0, to: 0, insert: "x" } });
      expect(rafSpy).not.toHaveBeenCalled();
    });
  });

  // jsdom has no layout engine so view.dispatch({ scrollIntoView: true }) never
  // sets update.viewportChanged.  Drive SpellcheckTrigger directly with mocks.
  describe("scroll (viewport) trigger", () => {
    it("schedules a re-scan when the viewport changes", () => {
      vi.useFakeTimers();
      const el = document.createElement("div");
      // Construct with prevDocLength=0 so the load trigger fires on first update.
      const plugin = new SpellcheckTrigger(mockView(0, el));

      // First update: empty→non-empty transition fires the load trigger.
      plugin.update(mockUpdate({ docLength: 10, prevDocLength: 0, contentDOM: el }));
      rafSpy.mockClear();

      // Simulate a viewport change (scroll).
      plugin.update(mockUpdate({ docLength: 10, viewportChanged: true, contentDOM: el }));

      // Before the debounce fires, rAF should not have been called yet.
      expect(rafSpy).not.toHaveBeenCalled();

      // After the 300ms debounce, rAF should fire.
      vi.advanceTimersByTime(300);
      expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    it("debounces rapid scroll events into a single re-scan", () => {
      vi.useFakeTimers();
      const el = document.createElement("div");
      const plugin = new SpellcheckTrigger(mockView(0, el));

      plugin.update(mockUpdate({ docLength: 10, prevDocLength: 0, contentDOM: el }));
      rafSpy.mockClear();

      // Simulate three rapid viewport changes.
      for (let i = 0; i < 3; i++) {
        plugin.update(mockUpdate({ docLength: 10, viewportChanged: true, contentDOM: el }));
      }

      vi.advanceTimersByTime(300);
      // All three scroll events should collapse into one rAF call.
      expect(rafSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("cleanup", () => {
    it("cancels the scroll timer on destroy", () => {
      vi.useFakeTimers();
      const clearSpy = vi.spyOn(globalThis, "clearTimeout");
      const el = document.createElement("div");
      const plugin = new SpellcheckTrigger(mockView(0, el));

      // Fire the load trigger, then arm the scroll timer.
      plugin.update(mockUpdate({ docLength: 10, prevDocLength: 0, contentDOM: el }));
      rafSpy.mockClear();
      plugin.update(mockUpdate({ docLength: 10, viewportChanged: true, contentDOM: el }));

      plugin.destroy();

      // clearTimeout should have been called to cancel the pending timer.
      expect(clearSpy).toHaveBeenCalled();
      // rAF was NOT called after destroy.
      expect(rafSpy).not.toHaveBeenCalled();

      clearSpy.mockRestore();
    });
  });
});
