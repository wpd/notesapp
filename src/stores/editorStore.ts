// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { create } from "zustand";
import * as Y from "yjs";
import { invoke } from "@tauri-apps/api/core";

interface EditorStoreState {
  /** Map from file path → Y.Doc (shared across all tiles editing the same file) */
  ydocs: Record<string, Y.Doc>;
  /** Map from tile ID → dirty state */
  dirtyStates: Record<string, boolean>;
  /** Map from tile ID → autosave timer handle */
  autosaveTimers: Record<string, ReturnType<typeof setInterval>>;
  /** Map from file path → 1-indexed line of the caret in the focused editor. */
  cursorLines: Record<string, number>;

  getOrCreateYDoc: (filePath: string) => Y.Doc;
  releaseYDoc: (filePath: string) => void;
  setDirty: (tileId: string, dirty: boolean) => void;
  isDirty: (tileId: string) => boolean;
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
        const next = { ...state.ydocs };
        delete next[filePath];
        return { ydocs: next };
      });
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
    set((state) => ({
      dirtyStates: { ...state.dirtyStates, [tileId]: false },
    }));
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
