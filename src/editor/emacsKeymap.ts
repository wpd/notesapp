// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { Extension } from "@tiptap/core";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { selectTextblockStart, selectTextblockEnd } from "@tiptap/pm/commands";

// Module-level kill ring, shared across all WYSIWYG tiles in the window.
// Cross-editor (CodeMirror ↔ Tiptap) ring sharing is out of scope.
const killRing: string[] = [];

function killPush(text: string): void {
  if (text) killRing.unshift(text);
}

function killTop(): string {
  return killRing[0] ?? "";
}

// Exported for the document-level Esc-prefix dispatcher in useKeyboardShortcuts.ts.

// Selection.modify is a non-standard extension available in WebKit/Chrome but
// absent in jsdom.  Guard with a typeof check so unit tests don't throw.
function selectionModify(alter: string, direction: string, granularity: string): void {
  const sel = globalThis.getSelection();
  if (sel && typeof (sel as unknown as Record<string, unknown>)["modify"] === "function") {
    (sel as unknown as { modify: (a: string, d: string, g: string) => void }).modify(
      alter, direction, granularity,
    );
  }
}

export function wordForwardTiptap(_editor: TiptapEditor): boolean {
  selectionModify("move", "forward", "word");
  return true;
}

export function wordBackwardTiptap(_editor: TiptapEditor): boolean {
  selectionModify("move", "backward", "word");
  return true;
}

export function deleteWordForwardTiptap(editor: TiptapEditor): boolean {
  const { state, dispatch } = editor.view;
  const { $head } = state.selection;
  const text = state.doc.textBetween($head.pos, $head.end());
  // Skip any leading whitespace then the following word.
  const match = /^\s*\S+/.exec(text);
  const advance = match ? match[0].length : text.length;
  if (advance > 0) {
    const to = $head.pos + advance;
    killPush(state.doc.textBetween($head.pos, to));
    dispatch(state.tr.delete($head.pos, to));
  }
  return true;
}

export function deleteWordBackwardTiptap(editor: TiptapEditor): boolean {
  const { state, dispatch } = editor.view;
  const { $head } = state.selection;
  const text = state.doc.textBetween($head.start(), $head.pos);
  // Skip any trailing whitespace then the preceding word.
  const match = /\S+\s*$/.exec(text);
  const retreat = match ? match[0].length : text.length;
  if (retreat > 0) {
    const from = $head.pos - retreat;
    killPush(state.doc.textBetween(from, $head.pos));
    dispatch(state.tr.delete(from, $head.pos));
  }
  return true;
}

// Allow unit tests to inspect / reset the kill ring.
export const _killRingForTest = {
  top: killTop,
  reset: () => { killRing.length = 0; },
};

/**
 * EmacsKeymap — Tiptap Extension that provides Emacs-style keybindings
 * inside the WYSIWYG (Preview tile) editor, mirroring the bindings that
 * @replit/codemirror-emacs provides in the CodeMirror Editor tile.
 *
 * SPEC.md §5.2 — Emacs keybindings in the WYSIWYG editor.
 *
 * Excluded from this extension (Editor-tile only per SPEC §5.2):
 * TAB heading-fold cycle, S-TAB fold toggle, org-mode table navigation,
 * keyboard macros, rectangle operations, incremental search.
 */
export const EmacsKeymap = Extension.create({
  name: "emacsKeymap",

  addStorage() {
    return { markPos: null as number | null };
  },

  addKeyboardShortcuts() {
    // Capture editor reference — safe because shortcuts are evaluated lazily.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ext = this;

    return {
      // C-f — forward one character
      "Ctrl-f": () => {
        const { state, dispatch } = ext.editor.view;
        const pos = Math.min(state.selection.head + 1, state.doc.content.size);
        dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
        return true;
      },

      // C-b — backward one character
      "Ctrl-b": () => {
        const { state, dispatch } = ext.editor.view;
        const pos = Math.max(state.selection.head - 1, 0);
        dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
        return true;
      },

      // C-n — next line (layout-aware; relies on browser Selection API)
      "Ctrl-n": () => {
        selectionModify("move", "forward", "line");
        return true;
      },

      // C-p — previous line
      "Ctrl-p": () => {
        selectionModify("move", "backward", "line");
        return true;
      },

      // C-a — beginning of line (text block)
      "Ctrl-a": () =>
        selectTextblockStart(
          ext.editor.view.state,
          ext.editor.view.dispatch,
          ext.editor.view,
        ),

      // C-e — end of line (text block)
      "Ctrl-e": () =>
        selectTextblockEnd(
          ext.editor.view.state,
          ext.editor.view.dispatch,
          ext.editor.view,
        ),

      // C-k — kill to end of text block
      "Ctrl-k": () => {
        const { state, dispatch } = ext.editor.view;
        const { $head } = state.selection;
        const endPos = $head.end();
        killPush(state.doc.textBetween($head.pos, endPos));
        dispatch(state.tr.delete($head.pos, endPos));
        return true;
      },

      // C-y — yank (insert top of kill ring)
      "Ctrl-y": () => {
        const text = killTop();
        if (text) ext.editor.commands.insertContent(text);
        return true;
      },

      // C-space — set mark at cursor
      "Ctrl- ": () => {
        (ext.storage as { markPos: number | null }).markPos =
          ext.editor.view.state.selection.head;
        return true;
      },

      // C-w — kill region (mark → cursor)
      "Ctrl-w": () => {
        const storage = ext.storage as { markPos: number | null };
        if (storage.markPos == null) return true;
        const { state, dispatch } = ext.editor.view;
        const head = state.selection.head;
        const from = Math.min(storage.markPos, head);
        const to = Math.max(storage.markPos, head);
        killPush(state.doc.textBetween(from, to));
        dispatch(state.tr.delete(from, to));
        storage.markPos = null;
        return true;
      },

      // M-w — copy region without deleting
      "Alt-w": () => {
        const storage = ext.storage as { markPos: number | null };
        if (storage.markPos == null) return true;
        const { state } = ext.editor.view;
        const head = state.selection.head;
        const from = Math.min(storage.markPos, head);
        const to = Math.max(storage.markPos, head);
        killPush(state.doc.textBetween(from, to));
        storage.markPos = null;
        return true;
      },

      // C-/ / C-_ — undo
      "Ctrl-/": () => { ext.editor.commands.undo(); return true; },
      "Ctrl-_": () => { ext.editor.commands.undo(); return true; },

      // C-g — cancel (clear mark, collapse selection)
      "Ctrl-g": () => {
        (ext.storage as { markPos: number | null }).markPos = null;
        const { state, dispatch } = ext.editor.view;
        dispatch(
          state.tr.setSelection(
            TextSelection.create(state.doc, state.selection.head),
          ),
        );
        return true;
      },

      // M-< — beginning of document  (also dispatched via Esc-prefix)
      "Alt-<": () => {
        ext.editor.commands.focus("start");
        return true;
      },

      // M-> — end of document  (also dispatched via Esc-prefix)
      "Alt->": () => {
        ext.editor.commands.focus("end");
        return true;
      },

      // M-f — forward word (relies on browser Selection.modify; no-op in jsdom)
      "Alt-f": () => wordForwardTiptap(ext.editor),

      // M-b — backward word
      "Alt-b": () => wordBackwardTiptap(ext.editor),

      // M-d — kill word forward
      "Alt-d": () => deleteWordForwardTiptap(ext.editor),

      // M-Backspace — kill word backward
      "Alt-Backspace": () => deleteWordBackwardTiptap(ext.editor),
    };
  },
});
