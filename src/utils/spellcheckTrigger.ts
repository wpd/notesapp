// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { invoke } from "@tauri-apps/api/core";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { setSpellingErrors } from "./spellingDecorations";

// Ask the Rust backend (NSSpellChecker on macOS) for all misspelled word
// ranges in `text` and apply them as CodeMirror decorations.  Fire-and-forget:
// the ViewPlugin's update() is synchronous so we return immediately and let
// the dispatch happen when the Promise resolves.
function checkSpellingAsync(view: EditorView, text: string, destroyed: () => boolean): void {
  invoke<[number, number][]>("check_spelling", { text })
    .then((ranges) => {
      if (destroyed()) return;
      try {
        view.dispatch({
          effects: setSpellingErrors.of(
            ranges.map(([from, to]) => ({ from, to })),
          ),
        });
      } catch {
        // view was destroyed between the invoke and the dispatch
      }
    })
    .catch(() => {
      // non-macOS, command not registered, or the text contained a NUL byte
    });
}

const RECHECK_DEBOUNCE_MS = 1500;

// Exported so tests can instantiate directly and pass mock ViewUpdates,
// since jsdom has no layout engine and never sets update.viewportChanged.
export class SpellcheckTrigger {
  private prevDocLength: number;
  private _destroyed = false;
  private recheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(view: EditorView) {
    // Initialise to the actual doc length so an editor created with pre-loaded
    // content doesn't mis-fire the load trigger on the very first user edit.
    this.prevDocLength = view.state.doc.length;
  }

  update(update: ViewUpdate): void {
    const currentLength = update.state.doc.length;

    // Fire once when the document transitions from empty → non-empty (i.e.
    // yCollab has just finished syncing the initial file content).  Ask the
    // system spell checker for all misspelled ranges and mark them.
    if (update.docChanged && this.prevDocLength === 0 && currentLength > 0) {
      this.prevDocLength = currentLength;
      checkSpellingAsync(
        update.view,
        update.state.doc.toString(),
        () => this._destroyed,
      );
      return;
    }
    this.prevDocLength = currentLength;

    // After any subsequent edit, schedule a debounced full re-check so that
    // corrections (typed or accepted from WKWebView's suggestion menu) are
    // reflected once the user pauses.  spellingDecorations immediately clears
    // marks in the edited range; this re-check restores marks for words that
    // are still misspelled after the edit.
    if (update.docChanged) {
      if (this.recheckTimer !== null) clearTimeout(this.recheckTimer);
      const view = update.view;
      this.recheckTimer = setTimeout(() => {
        this.recheckTimer = null;
        if (!this._destroyed) {
          checkSpellingAsync(view, view.state.doc.toString(), () => this._destroyed);
        }
      }, RECHECK_DEBOUNCE_MS);
    }
  }

  destroy(): void {
    this._destroyed = true;
    if (this.recheckTimer !== null) {
      clearTimeout(this.recheckTimer);
      this.recheckTimer = null;
    }
  }
}

export const spellcheckTrigger = ViewPlugin.fromClass(SpellcheckTrigger);
