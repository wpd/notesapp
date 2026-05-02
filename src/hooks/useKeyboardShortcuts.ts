// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { useEffect, useRef } from "react";
import useLayoutStore, { TileMode } from "../stores/layoutStore";
import useEditorStore from "../stores/editorStore";
import useProjectStore from "../stores/projectStore";

interface ShortcutOptions {
  onOpenBufferSwitcher: (tileId: string, pickerMode: string) => void;
  onOpenFindFile: () => void;
  onModeSwitch: (tileId: string, mode: TileMode) => void;
}

// Synchronously push DOM focus into the CodeMirror editor for a given tileId.
// useEffect in EditorPane is async (runs after paint) and races with keystrokes
// fired immediately after a chord — this direct DOM query runs before any React
// scheduling and is therefore guaranteed to arrive before subsequent keydowns.
function focusEditorDom(tileId: string): void {
  const pane = document.querySelector(`[data-testid="editor-pane-${tileId}"]`);
  const cm = pane?.querySelector<HTMLElement>(".cm-content");
  cm?.focus();
}

export function useKeyboardShortcuts({
  onOpenBufferSwitcher,
  onOpenFindFile,
  onModeSwitch,
}: ShortcutOptions): void {
  const prefixActive = useRef(false);
  // Track C-x n prefix (mode-switch chord)
  const nPrefixActive = useRef(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const layout = useLayoutStore.getState();
      const editor = useEditorStore.getState();
      const project = useProjectStore.getState();

      // Clears both prefix refs and the store flag in one place.
      const clearPrefix = () => {
        prefixActive.current = false;
        nPrefixActive.current = false;
        if (useLayoutStore.getState().cxPrefixActive) {
          layout.setCxPrefixActive(false);
        }
      };

      // ---- Ctrl+Shift+B — toggle sidebar ----
      if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        layout.toggleSidebar();
        clearPrefix();
        return;
      }

      // ---- C-x prefix ----
      if (e.ctrlKey && e.key === "x") {
        e.preventDefault();
        prefixActive.current = true;
        nPrefixActive.current = false;
        layout.setCxPrefixActive(true);
        return;
      }

      // ---- C-x n prefix (mode switch) ----
      if (prefixActive.current && e.key === "n" && !e.ctrlKey) {
        e.preventDefault();
        prefixActive.current = false;
        nPrefixActive.current = true;
        // cxPrefixActive stays true while C-x n sub-prefix is pending
        return;
      }

      // ---- Handle C-x n {n,p,r,c} ----
      if (nPrefixActive.current) {
        clearPrefix();
        const focused = layout.focusedTileId;
        if (!focused) return;

        switch (e.key) {
          case "n": // C-x n n — Editor mode
            e.preventDefault();
            onModeSwitch(focused, "editor");
            return;
          case "p": // C-x n p — Preview mode
            e.preventDefault();
            {
              const tile = layout.tiles[focused];
              if (tile && tile.filePath && !tile.filePath.endsWith(".md")) {
                layout.setStatusMessage(
                  "Preview is only available for markdown files",
                );
                return;
              }
            }
            onModeSwitch(focused, "preview");
            return;
          case "r": // C-x n r — Reference mode (stub in Phase 1)
            e.preventDefault();
            onModeSwitch(focused, "reference");
            return;
          case "c": // C-x n c — AI Chat mode (stub in Phase 1)
            e.preventDefault();
            onModeSwitch(focused, "aichat");
            return;
          default:
            e.preventDefault();
            return;
        }
      }

      if (!prefixActive.current) return;
      clearPrefix();

      const focused = layout.focusedTileId;

      switch (true) {
        // C-x o — focus next tile
        case e.key === "o" && !e.ctrlKey && !e.shiftKey: {
          e.preventDefault();
          layout.focusNextTile();
          { const next = useLayoutStore.getState().focusedTileId; if (next) focusEditorDom(next); }
          break;
        }

        // C-x O — focus previous tile
        case e.key === "O" && !e.ctrlKey: {
          e.preventDefault();
          layout.focusPrevTile();
          { const prev = useLayoutStore.getState().focusedTileId; if (prev) focusEditorDom(prev); }
          break;
        }

        // C-x h — split horizontal
        case e.key === "h" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.splitTile(focused, "column");
          break;
        }

        // C-x v — split vertical
        case e.key === "v" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.splitTile(focused, "row");
          break;
        }

        // C-x 0 or C-x w — close current tile
        case (e.key === "0" || e.key === "w") && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.requestCloseTile(focused);
          break;
        }

        // C-x z — maximize / restore
        case e.key === "z" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) layout.toggleMaximize(focused);
          break;
        }

        // C-x b — buffer switcher (modal by tile mode)
        case e.key === "b" && !e.ctrlKey: {
          e.preventDefault();
          if (focused) {
            const tile = layout.tiles[focused];
            if (!tile) break;
            const pickerMode =
              tile.mode === "preview"
                ? "preview"
                : tile.mode === "missing"
                  ? "editor"
                  : tile.mode === "reference"
                    ? "reference-stub"
                    : tile.mode === "aichat"
                      ? "aichat-stub"
                      : "editor";
            onOpenBufferSwitcher(focused, pickerMode);
          }
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
            if (tile?.filePath && (tile.mode === "editor" || tile.mode === "preview")) {
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

        // C-x C-f — find file
        case e.key === "f" && e.ctrlKey: {
          e.preventDefault();
          onOpenFindFile();
          break;
        }

        // C-x N (1–9) — focus tile by reading-order index
        case /^[1-9]$/.test(e.key) && !e.ctrlKey: {
          e.preventDefault();
          const ids = layout.getOrderedTileIds();
          const idx = Number(e.key) - 1;
          if (idx < ids.length) {
            layout.focusTile(ids[idx]);
            focusEditorDom(ids[idx]);
          }
          break;
        }

        default:
          e.preventDefault();
          break;
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
    };
  }, [onOpenBufferSwitcher, onOpenFindFile, onModeSwitch]);
}
