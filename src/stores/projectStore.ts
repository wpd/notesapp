// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface NoteEntry {
  path: string;
  name: string;
  modified_at: number;
}

interface ProjectState {
  projectDir: string | null;
  notes: NoteEntry[];
  isLoaded: boolean;
  error: string | null;

  setProjectDir: (dir: string) => Promise<void>;
  refreshNotes: () => Promise<void>;
  reset: () => void;
}

const useProjectStore = create<ProjectState>((set, get) => ({
  projectDir: null,
  notes: [],
  isLoaded: false,
  error: null,

  setProjectDir: async (dir: string) => {
    try {
      const notes = await invoke<NoteEntry[]>("open_project", { path: dir });
      set({ projectDir: dir, notes, isLoaded: true, error: null });
    } catch (err) {
      set({ error: String(err), isLoaded: false });
    }
  },

  refreshNotes: async () => {
    const { projectDir } = get();
    if (!projectDir) return;
    try {
      const notes = await invoke<NoteEntry[]>("list_notes", {
        path: projectDir,
      });
      set({ notes });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  reset: () => {
    set({ projectDir: null, notes: [], isLoaded: false, error: null });
  },
}));

export default useProjectStore;
