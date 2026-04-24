// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface NoteEntry {
  path: string;
  name: string;
  extension?: string;
  modified_at: number;
}

interface ProjectState {
  projectDir: string | null;
  notes: NoteEntry[];
  isLoaded: boolean;
  error: string | null;

  setProjectDir: (dir: string) => Promise<boolean>;
  refreshNotes: () => Promise<void>;
  reset: () => void;
}

const useProjectStore = create<ProjectState>((set, get) => ({
  projectDir: null,
  notes: [],
  isLoaded: false,
  error: null,

  setProjectDir: async (dir: string): Promise<boolean> => {
    try {
      const notes = await invoke<NoteEntry[]>("open_project", { path: dir });
      set({ projectDir: dir, notes, isLoaded: true, error: null });
      return true;
    } catch (err) {
      set({ projectDir: null, notes: [], isLoaded: false, error: String(err) });
      return false;
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
