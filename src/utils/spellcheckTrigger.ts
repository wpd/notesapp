// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

const SCROLL_DEBOUNCE_MS = 300;

// WebKit's continuous spell checker only fires in response to keyboard input
// events, not programmatic DOM mutations. This means yCollab populating the
// editor on document load — and CodeMirror creating fresh DOM nodes for newly
// scrolled-into-view lines — both escape the checker entirely.
//
// Re-enabling spellcheck on a contenteditable element forces WebKit to rescan
// the entire element's content. We briefly remove the attribute and re-add it
// via two back-to-back requestAnimationFrame calls so WebKit sees the
// transition. Direct DOM manipulation bypasses CodeMirror's contentAttributes
// extension to avoid a race with its own attribute management cycle.
function retriggerSpellcheck(el: HTMLElement): void {
  el.removeAttribute("spellcheck");
  requestAnimationFrame(() => {
    el.setAttribute("spellcheck", "true");
  });
}

// Exported so tests can instantiate directly and pass mock ViewUpdates,
// since jsdom has no layout engine and never sets update.viewportChanged.
export class SpellcheckTrigger {
  private prevDocLength: number;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(view: EditorView) {
    // Initialise to the actual doc length so an editor created with pre-loaded
    // content doesn't mis-fire the load trigger on the very first user edit.
    this.prevDocLength = view.state.doc.length;
  }

  update(update: ViewUpdate): void {
    const currentLength = update.state.doc.length;

    // Fire once when the document transitions from empty → non-empty (i.e.
    // yCollab has just finished syncing the initial file content).
    if (update.docChanged && this.prevDocLength === 0 && currentLength > 0) {
      this.prevDocLength = currentLength;
      retriggerSpellcheck(update.view.contentDOM);
      return;
    }
    this.prevDocLength = currentLength;

    // Re-fire (debounced) when the viewport changes: CodeMirror virtualizes
    // rendering, so scrolling produces fresh DOM nodes that haven't been seen
    // by the spell checker.
    if (update.viewportChanged) {
      if (this.scrollTimer !== null) {
        clearTimeout(this.scrollTimer);
      }
      const el = update.view.contentDOM;
      this.scrollTimer = setTimeout(() => {
        this.scrollTimer = null;
        retriggerSpellcheck(el);
      }, SCROLL_DEBOUNCE_MS);
    }
  }

  destroy(): void {
    if (this.scrollTimer !== null) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
  }
}

export const spellcheckTrigger = ViewPlugin.fromClass(SpellcheckTrigger);
