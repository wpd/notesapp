// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { create } from "zustand";
import * as Y from "yjs";
import { invoke } from "@tauri-apps/api/core";
import useLayoutStore from "./layoutStore";

interface EditorStoreState {
  /** Map from file path → Y.Doc (shared across all tiles editing the same file) */
  ydocs: Record<string, Y.Doc>;
  /** Map from tile ID → dirty state */
  dirtyStates: Record<string, boolean>;
  /** Map from tile ID → autosave timer handle */
  autosaveTimers: Record<string, ReturnType<typeof setInterval>>;
  /** Map from file path → 1-indexed line of the caret in the focused editor. */
  cursorLines: Record<string, number>;
  /**
   * Map from file path → content at last explicit save (or initial load).
   * Used to detect undo-to-clean: when current Y.Doc content equals this
   * value the buffer is back to its saved state (SPEC.md §5.1, §9.1).
   */
  savedContents: Record<string, string>;
  /**
   * Reference counts for Y.Docs.  Each tile (Editor or WYSIWYG) calls
   * attachBridge on mount and detachBridge on unmount.  When the count
   * reaches zero the Y.Doc is destroyed (SPEC.md §5.2 "released when the
   * last tile unbinds").
   */
  bridgeRefcounts: Record<string, number>;

  getOrCreateYDoc: (filePath: string) => Y.Doc;
  releaseYDoc: (filePath: string) => void;
  /**
   * Increment the reference count for the Y.Doc at `filePath`, creating the
   * doc if it does not exist yet.  Returns the shared Y.Doc.
   */
  attachBridge: (filePath: string) => Y.Doc;
  /**
   * Decrement the reference count for the Y.Doc at `filePath`.  When the
   * count reaches zero the doc is destroyed.
   */
  detachBridge: (filePath: string) => void;
  setDirty: (tileId: string, dirty: boolean) => void;
  isDirty: (tileId: string) => boolean;
  /**
   * Record the on-disk content for a file.
   * Must be called (a) when a file is first loaded into a Y.Doc, and
   * (b) immediately after a successful explicit save.
   */
  setSavedContent: (filePath: string, content: string) => void;
  /**
   * Returns true iff `content` is byte-for-byte equal to the last saved
   * content for `filePath` (i.e. the buffer is in the "clean" state).
   * Returns false when no saved content has been recorded yet.
   */
  isContentClean: (filePath: string, content: string) => boolean;
  saveFile: (tileId: string, filePath: string) => Promise<void>;
  startAutosave: (tileId: string, filePath: string) => void;
  stopAutosave: (tileId: string) => void;
  setCursorLine: (filePath: string, line: number) => void;
}

const useEditorStore = create<EditorStoreState>((set, get) => ({
  ydocs: {},
  dirtyStates: {},
  autosaveTimers: {},
  cursorLines: {},
  savedContents: {},
  bridgeRefcounts: {},

  getOrCreateYDoc: (filePath: string) => {
    const existing = get().ydocs[filePath];
    if (existing) return existing;
    const doc = new Y.Doc();
    set((state) => ({
      ydocs: { ...state.ydocs, [filePath]: doc },
    }));
    return doc;
  },

  releaseYDoc: (filePath: string) => {
    const { ydocs } = get();
    const doc = ydocs[filePath];
    if (doc) {
      doc.destroy();
      set((state) => {
        const nextDocs = { ...state.ydocs };
        delete nextDocs[filePath];
        const nextRefs = { ...state.bridgeRefcounts };
        delete nextRefs[filePath];
        return { ydocs: nextDocs, bridgeRefcounts: nextRefs };
      });
    }
  },

  attachBridge: (filePath: string) => {
    const doc = get().getOrCreateYDoc(filePath);
    set((state) => ({
      bridgeRefcounts: {
        ...state.bridgeRefcounts,
        [filePath]: (state.bridgeRefcounts[filePath] ?? 0) + 1,
      },
    }));
    return doc;
  },

  detachBridge: (filePath: string) => {
    const count = get().bridgeRefcounts[filePath] ?? 0;
    if (count <= 1) {
      get().releaseYDoc(filePath);
    } else {
      set((state) => ({
        bridgeRefcounts: {
          ...state.bridgeRefcounts,
          [filePath]: count - 1,
        },
      }));
    }
  },

  setDirty: (tileId: string, dirty: boolean) => {
    set((state) => ({
      dirtyStates: { ...state.dirtyStates, [tileId]: dirty },
    }));
  },

  isDirty: (tileId: string) => {
    return get().dirtyStates[tileId] ?? false;
  },

  setSavedContent: (filePath: string, content: string) => {
    set((state) => ({
      savedContents: { ...state.savedContents, [filePath]: content },
    }));
  },

  isContentClean: (filePath: string, content: string) => {
    const saved = get().savedContents[filePath];
    if (saved === undefined) return false;
    return content === saved;
  },

  saveFile: async (tileId: string, filePath: string) => {
    const { ydocs } = get();
    const doc = ydocs[filePath];
    if (!doc) return;
    const text = doc.getText("content").toString();
    await invoke("write_note", { path: filePath, content: text });
    // Delete tmp file after successful save
    try {
      await invoke("delete_tmp", { path: filePath });
    } catch {
      // Ignore
    }
    // Clear dirty for every tile bound to this file (not just the saving tile),
    // mirroring the undo-to-clean loop in EditorPane. Without this, a sibling
    // tile whose updateListener also marked dirty would keep dirty=true and
    // trigger a false-positive save prompt on window close.
    // Always include tileId in case the store doesn't know about it yet (tests).
    const boundTileIds = new Set([
      tileId,
      ...Object.values(useLayoutStore.getState().tiles)
        .filter((t) => t.filePath === filePath)
        .map((t) => t.id),
    ]);
    set((state) => {
      const nextDirty = { ...state.dirtyStates };
      for (const id of boundTileIds) nextDirty[id] = false;
      return {
        dirtyStates: nextDirty,
        savedContents: { ...state.savedContents, [filePath]: text },
      };
    });
  },

  startAutosave: (tileId: string, filePath: string) => {
    const { autosaveTimers } = get();
    // Clear existing timer
    if (autosaveTimers[tileId]) {
      clearInterval(autosaveTimers[tileId]);
    }
    const timer = setInterval(async () => {
      const { ydocs, dirtyStates } = get();
      if (!dirtyStates[tileId]) return;
      const doc = ydocs[filePath];
      if (!doc) return;
      const text = doc.getText("content").toString();
      try {
        await invoke("autosave_note", { path: filePath, content: text });
      } catch {
        // Non-fatal
      }
    }, 30_000);
    set((state) => ({
      autosaveTimers: { ...state.autosaveTimers, [tileId]: timer },
    }));
  },

  stopAutosave: (tileId: string) => {
    const { autosaveTimers } = get();
    if (autosaveTimers[tileId]) {
      clearInterval(autosaveTimers[tileId]);
      set((state) => {
        const next = { ...state.autosaveTimers };
        delete next[tileId];
        return { autosaveTimers: next };
      });
    }
  },

  setCursorLine: (filePath: string, line: number) => {
    set((state) => ({
      cursorLines: { ...state.cursorLines, [filePath]: line },
    }));
  },
}));

export default useEditorStore;
