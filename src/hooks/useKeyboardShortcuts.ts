// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Global keyboard shortcut handler for pane-management chords.
 *
 * Implements Emacs-style C-x prefix: press Ctrl+X, then the action key.
 *
 * Bound at the document level (capture phase) so it fires even when
 * CodeMirror has focus.
 */

import { useEffect, useRef } from "react";
import useLayoutStore from "../stores/layoutStore";
import useEditorStore from "../stores/editorStore";
import useProjectStore from "../stores/projectStore";

interface ShortcutOptions {
  onOpenBufferSwitcher: () => void;
  onOpenFindFile: () => void;
}

export function useKeyboardShortcuts({
  onOpenBufferSwitcher,
  onOpenFindFile,
}: ShortcutOptions): void {
  // true when the user has pressed C-x and we're waiting for the second key
  const prefixActive = useRef(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const layout = useLayoutStore.getState();
      const editor = useEditorStore.getState();
      const project = useProjectStore.getState();

      // ---- Ctrl+Shift+B  — toggle sidebar (not part of C-x chord) ----
      if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        layout.toggleSidebar();
        prefixActive.current = false;
        return;
      }

      // ---- C-x prefix ----
      if (e.ctrlKey && e.key === "x") {
        e.preventDefault();
        prefixActive.current = true;
        return;
      }

      if (!prefixActive.current) return;
      prefixActive.current = false; // consume prefix regardless

      const focused = layout.focusedTileId;

      switch (true) {
        // C-x o — focus next pane
        case e.key === "o" && !e.ctrlKey: {
          e.preventDefault();
          layout.focusNextTile();
          break;
        }

        // C-x h — split horizontal (horizontal divider = tiles stacked top/bottom)
        case e.key === "h" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.splitTile(focused, "column");
          break;
        }

        // C-x v — split vertical (vertical divider = tiles side by side)
        case e.key === "v" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.splitTile(focused, "row");
          break;
        }

        // C-x 0 — close current pane
        case e.key === "0" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.closeTile(focused);
          break;
        }

        // C-x z — maximize / restore
        case e.key === "z" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.toggleMaximize(focused);
          break;
        }

        // C-x b — buffer switcher
        case e.key === "b" && !e.ctrlKey: {
          e.preventDefault();
          onOpenBufferSwitcher();
          break;
        }

        // C-x p — toggle pin (editor tiles only)
        case e.key === "p" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.togglePin(focused);
          break;
        }

        // C-x C-s — save current note
        case e.key === "s" && e.ctrlKey: {
          e.preventDefault();
          if (focused) {
            const tile = layout.tiles[focused];
            if (tile?.filePath) {
              editor
                .saveFile(focused, tile.filePath)
                .then(() => {
                  if (project.projectDir) {
                    return layout.persistLayout(project.projectDir);
                  }
                })
                .catch(console.error);
            }
          }
          break;
        }

        // C-x C-f — find file (can create new notes)
        case e.key === "f" && e.ctrlKey: {
          e.preventDefault();
          onOpenFindFile();
          break;
        }

        default:
          break;
      }
    };

    // Use capture phase so we intercept before CodeMirror
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
    };
  }, [onOpenBufferSwitcher, onOpenFindFile]);
}
