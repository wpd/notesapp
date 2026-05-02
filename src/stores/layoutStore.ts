// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  MosaicNode,
  MosaicBranch,
  updateTree,
  getLeaves,
} from "react-mosaic-component";
import useProjectStore from "./projectStore";
import useEditorStore from "./editorStore";

export type TileMode = "editor" | "preview" | "reference" | "aichat" | "missing";

export interface TileState {
  id: string;
  mode: TileMode;
  filePath: string | null;
  /** For Missing tiles: the original file path that could not be resolved */
  missingPath?: string;
}

/**
 * SPEC.md §4.0.1 — last-tile release dialog.
 * A request to release a buffer that has unsaved changes must be confirmed
 * via Save / Discard / Cancel before the underlying mutation happens.
 */
export type PendingDialog =
  | { kind: "close"; tileId: string; filePath: string }
  | {
      kind: "buffer";
      tileId: string;
      newFilePath: string;
      newMode?: TileMode;
      oldFilePath: string;
    }
  | {
      kind: "quit";
      dirtyBuffers: Array<{ filePath: string; representativeTileId: string }>;
      onComplete?: () => void;
    }
  | {
      // SPEC.md §5.5 — Continue/Cancel confirmation for a Missing tile with
      // unsaved in-memory edits. Save is not offered because the underlying
      // file is gone.
      kind: "missing-recovery";
      tileId: string;
      missingPath: string;
      action: "close" | "open-different";
      onContinue: () => void;
    };

/** Serialized layout persisted to layout.json */
interface PersistedLayout {
  tree: MosaicNode<string> | null;
  tiles: Record<
    string,
    { mode: TileMode; filePath: string | null; missingPath?: string }
  >;
}

/** Legacy layout format for backward compatibility */
interface LegacyPersistedLayout {
  tree: MosaicNode<string> | null;
  tiles: Record<
    string,
    {
      type?: string;
      mode?: string;
      filePath: string | null;
      missingPath?: string;
    }
  >;
}

interface LayoutStoreState {
  mosaicTree: MosaicNode<string> | null;
  tiles: Record<string, TileState>;
  focusedTileId: string | null;
  pinnedTileId: string | null;
  sidebarVisible: boolean;
  maximizedTileId: string | null;
  savedTreeBeforeMaximize: MosaicNode<string> | null;
  tileCounter: number;
  /** Status bar message, auto-cleared after a timeout */
  statusMessage: string | null;
  /** SPEC.md §4.0.1 pending release dialog state */
  pendingDialog: PendingDialog | null;
  /** Per-tile word-wrap preference for editor tiles. Defaults to true. */
  wordWrap: Record<string, boolean>;
  /** True while the C-x prefix chord is active (between C-x and the second key). */
  cxPrefixActive: boolean;

  // Getters
  getTileIds: () => string[];
  getOrderedTileIds: () => string[];

  // Actions
  initDefaultLayout: (firstNotePath?: string) => void;
  setMosaicTree: (tree: MosaicNode<string> | null) => void;
  splitTile: (tileId: string, direction: "row" | "column") => void;
  closeTile: (tileId: string) => void;
  /** Guarded close: prompts Save/Discard/Cancel if tile is last-of-dirty-buffer */
  requestCloseTile: (tileId: string) => void;
  focusTile: (tileId: string) => void;
  focusNextTile: () => void;
  focusPrevTile: () => void;
  togglePin: (tileId: string) => void;
  toggleSidebar: () => void;
  toggleMaximize: (tileId: string) => void;
  setTileFile: (tileId: string, filePath: string) => void;
  /** Guarded file switch: prompts Save/Discard/Cancel if releasing last-of-dirty-buffer */
  requestSetTileFile: (
    tileId: string,
    newFilePath: string,
    newMode?: TileMode,
  ) => boolean;
  setTileMode: (tileId: string, mode: TileMode) => void;
  setTileMissing: (tileId: string, missingPath: string) => void;
  createTile: (mode: TileMode, filePath?: string | null) => string;
  persistLayout: (projectDir: string) => Promise<void>;
  loadLayout: (projectDir: string) => Promise<boolean>;
  setStatusMessage: (msg: string | null) => void;
  toggleWordWrap: (tileId: string) => void;
  setCxPrefixActive: (active: boolean) => void;

  /** Count how many tiles are bound to a given filePath */
  countTilesForFile: (filePath: string) => number;
  /** Check if a tile is the last one bound to a given file */
  isLastTileForFile: (tileId: string) => boolean;

  // Dialog control
  setPendingDialog: (dialog: PendingDialog | null) => void;
  /** Collect all currently-dirty buffers for the consolidated-quit dialog */
  collectDirtyBuffers: (
    dirtyTiles: Record<string, boolean>,
  ) => Array<{ filePath: string; representativeTileId: string }>;
}

// ---------------------------------------------------------------------------
// Tree traversal helpers
// ---------------------------------------------------------------------------

function collectLeaves(tree: MosaicNode<string>): string[] {
  if (typeof tree === "string") return [tree];
  return [...collectLeaves(tree.first), ...collectLeaves(tree.second)];
}

function getPathToLeaf(
  tree: MosaicNode<string>,
  targetId: string,
): MosaicBranch[] | null {
  if (typeof tree === "string") {
    return tree === targetId ? [] : null;
  }
  const leftPath = getPathToLeaf(tree.first, targetId);
  if (leftPath !== null) return ["first" as MosaicBranch, ...leftPath];
  const rightPath = getPathToLeaf(tree.second, targetId);
  if (rightPath !== null) return ["second" as MosaicBranch, ...rightPath];
  return null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let _tileCounter = 0;
function nextTileId(mode: TileMode): string {
  _tileCounter += 1;
  return `${mode}-${_tileCounter}`;
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  const dir = useProjectStore.getState().projectDir;
  if (!dir) return;
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    void useLayoutStore.getState().persistLayout(dir);
  }, 250);
}

let _statusTimer: ReturnType<typeof setTimeout> | null = null;

const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  mosaicTree: null,
  tiles: {},
  focusedTileId: null,
  pinnedTileId: null,
  sidebarVisible: true,
  maximizedTileId: null,
  savedTreeBeforeMaximize: null,
  tileCounter: 0,
  statusMessage: null,
  pendingDialog: null,
  wordWrap: {},
  cxPrefixActive: false,

  getTileIds: () => {
    const { mosaicTree } = get();
    if (!mosaicTree) return [];
    return getLeaves(mosaicTree);
  },

  getOrderedTileIds: () => {
    const { mosaicTree } = get();
    if (!mosaicTree) return [];
    return collectLeaves(mosaicTree);
  },

  initDefaultLayout: (firstNotePath?: string) => {
    const editorId = nextTileId("editor");
    const previewId = nextTileId("preview");
    const defaultTree: MosaicNode<string> = {
      direction: "row",
      first: editorId,
      second: previewId,
      splitPercentage: 50,
    };
    set({
      mosaicTree: defaultTree,
      tiles: {
        [editorId]: {
          id: editorId,
          mode: "editor",
          filePath: firstNotePath ?? null,
        },
        [previewId]: {
          id: previewId,
          mode: "preview",
          filePath: firstNotePath ?? null,
        },
      },
      focusedTileId: editorId,
    });
  },

  setMosaicTree: (tree) => {
    set({ mosaicTree: tree });
    if (tree) {
      const liveIds = new Set(getLeaves(tree));
      set((state) => {
        const tiles = { ...state.tiles };
        for (const id of Object.keys(tiles)) {
          if (!liveIds.has(id)) delete tiles[id];
        }
        const pinnedTileId =
          state.pinnedTileId && liveIds.has(state.pinnedTileId)
            ? state.pinnedTileId
            : null;
        const focusedTileId =
          state.focusedTileId && liveIds.has(state.focusedTileId)
            ? state.focusedTileId
            : liveIds.size > 0
              ? [...liveIds][0]
              : null;
        return { tiles, pinnedTileId, focusedTileId };
      });
    }
    schedulePersist();
  },

  splitTile: (tileId, direction) => {
    const { mosaicTree, tiles } = get();
    if (!mosaicTree) return;

    const path = getPathToLeaf(mosaicTree, tileId);
    if (path === null) return;

    const parentTile = tiles[tileId];
    const focusedMode = parentTile?.mode ?? "editor";
    const newId = nextTileId(focusedMode);

    const splitNode: MosaicNode<string> = {
      direction,
      first: tileId,
      second: newId,
      splitPercentage: 50,
    };

    const newTree = updateTree(mosaicTree, [
      {
        path,
        spec: { $set: splitNode },
      },
    ]);

    const newTile: TileState = {
      id: newId,
      mode: focusedMode,
      filePath: parentTile?.filePath ?? null,
      missingPath: parentTile?.missingPath,
    };

    set((state) => ({
      mosaicTree: newTree,
      tiles: { ...state.tiles, [newId]: newTile },
      focusedTileId: tileId, // original tile keeps focus per SPEC
    }));
    schedulePersist();
  },

  closeTile: (tileId) => {
    const { mosaicTree, tiles } = get();
    if (!mosaicTree) return;
    if (typeof mosaicTree === "string") {
      return;
    }

    const path = getPathToLeaf(mosaicTree, tileId);
    if (path === null) return;

    const leaves = getLeaves(mosaicTree);
    if (leaves.length <= 1) return;

    if (path.length === 0) return;

    const newTree = updateTree(mosaicTree, [
      {
        path: path.slice(0, -1),
        spec: {
          $set: getOtherBranch(mosaicTree, path),
        },
      },
    ]);

    const newTiles = { ...tiles };
    delete newTiles[tileId];

    const newFocused = leaves.find((id) => id !== tileId) ?? null;

    set({
      mosaicTree: newTree,
      tiles: newTiles,
      focusedTileId: newFocused,
      pinnedTileId: get().pinnedTileId === tileId ? null : get().pinnedTileId,
    });
    schedulePersist();
  },

  /**
   * Guarded close — SPEC.md §4.0.1.
   * If this tile is the last one bound to a modified buffer, open the
   * Save / Discard / Cancel dialog instead of immediately closing.
   */
  requestCloseTile: (tileId) => {
    const { tiles, isLastTileForFile } = get();
    const tile = tiles[tileId];
    if (!tile) return;
    const isDirty = useEditorStore.getState().isDirty(tileId);
    if (
      tile.filePath &&
      tile.mode !== "missing" &&
      isDirty &&
      isLastTileForFile(tileId)
    ) {
      set({
        pendingDialog: {
          kind: "close",
          tileId,
          filePath: tile.filePath,
        },
      });
      return;
    }
    get().closeTile(tileId);
  },

  focusTile: (tileId) => {
    set({ focusedTileId: tileId });
  },

  focusNextTile: () => {
    const { mosaicTree, focusedTileId } = get();
    if (!mosaicTree) return;
    const ids = collectLeaves(mosaicTree);
    if (ids.length === 0) return;
    const idx = focusedTileId ? ids.indexOf(focusedTileId) : -1;
    const next = ids[(idx + 1) % ids.length];
    set({ focusedTileId: next });
  },

  focusPrevTile: () => {
    const { mosaicTree, focusedTileId } = get();
    if (!mosaicTree) return;
    const ids = collectLeaves(mosaicTree);
    if (ids.length === 0) return;
    const idx = focusedTileId ? ids.indexOf(focusedTileId) : -1;
    const prev = ids[(idx - 1 + ids.length) % ids.length];
    set({ focusedTileId: prev });
  },

  togglePin: (tileId) => {
    const { tiles, pinnedTileId } = get();
    const tile = tiles[tileId];
    if (!tile || tile.mode !== "editor") return;
    if (pinnedTileId === tileId) {
      set({ pinnedTileId: null });
    } else {
      set({ pinnedTileId: tileId });
    }
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarVisible: !state.sidebarVisible }));
  },

  toggleMaximize: (tileId) => {
    const { maximizedTileId, mosaicTree } = get();
    if (maximizedTileId === tileId) {
      const saved = get().savedTreeBeforeMaximize;
      set({
        maximizedTileId: null,
        mosaicTree: saved ?? mosaicTree,
        savedTreeBeforeMaximize: null,
      });
    } else {
      set({
        savedTreeBeforeMaximize: mosaicTree,
        mosaicTree: tileId,
        maximizedTileId: tileId,
      });
    }
    schedulePersist();
  },

  setTileFile: (tileId, filePath) => {
    set((state) => ({
      tiles: {
        ...state.tiles,
        [tileId]: {
          ...state.tiles[tileId],
          filePath,
          missingPath: undefined,
        },
      },
    }));
    schedulePersist();
  },

  /**
   * Guarded buffer switch — SPEC.md §4.0.1.
   * Returns true if the switch was applied immediately, false if a
   * Save / Discard / Cancel dialog was opened instead.
   */
  requestSetTileFile: (tileId, newFilePath, newMode) => {
    const { tiles, isLastTileForFile } = get();
    const tile = tiles[tileId];
    if (!tile) return true;
    const oldPath = tile.filePath;
    const sameFile = oldPath === newFilePath;
    if (!sameFile && oldPath && tile.mode !== "missing") {
      const isDirty = useEditorStore.getState().isDirty(tileId);
      if (isDirty && isLastTileForFile(tileId)) {
        set({
          pendingDialog: {
            kind: "buffer",
            tileId,
            newFilePath,
            newMode,
            oldFilePath: oldPath,
          },
        });
        return false;
      }
    }
    if (newMode) {
      get().setTileMode(tileId, newMode);
    }
    get().setTileFile(tileId, newFilePath);
    return true;
  },

  setTileMode: (tileId, mode) => {
    set((state) => {
      const tile = state.tiles[tileId];
      if (!tile) return state;
      return {
        tiles: {
          ...state.tiles,
          [tileId]: { ...tile, mode },
        },
        // If tile was pinned and mode is no longer editor, discard pin
        pinnedTileId:
          state.pinnedTileId === tileId && mode !== "editor"
            ? null
            : state.pinnedTileId,
      };
    });
    schedulePersist();
  },

  setTileMissing: (tileId, missingPath) => {
    set((state) => {
      const tile = state.tiles[tileId];
      if (!tile) return state;
      return {
        tiles: {
          ...state.tiles,
          [tileId]: {
            ...tile,
            mode: "missing" as TileMode,
            missingPath,
          },
        },
        // Discard pin if this tile was pinned (SPEC.md §4.4)
        pinnedTileId:
          state.pinnedTileId === tileId ? null : state.pinnedTileId,
      };
    });
    schedulePersist();
  },

  createTile: (mode, filePath = null) => {
    const id = nextTileId(mode);
    set((state) => ({
      tiles: { ...state.tiles, [id]: { id, mode, filePath } },
      tileCounter: state.tileCounter + 1,
    }));
    return id;
  },

  persistLayout: async (projectDir) => {
    const { mosaicTree, tiles, savedTreeBeforeMaximize } = get();
    const treeToSave = savedTreeBeforeMaximize ?? mosaicTree;
    const payload: PersistedLayout = {
      tree: treeToSave,
      tiles: Object.fromEntries(
        Object.entries(tiles).map(([id, t]) => [
          id,
          { mode: t.mode, filePath: t.filePath, missingPath: t.missingPath },
        ]),
      ),
    };
    try {
      await invoke("save_layout", {
        projectDir,
        layoutJson: JSON.stringify(payload),
      });
    } catch {
      // Non-fatal
    }
  },

  loadLayout: async (projectDir) => {
    try {
      const json = await invoke<string | null>("load_layout", { projectDir });
      if (!json) return false;
      const data: LegacyPersistedLayout = JSON.parse(json);
      if (!data.tree || !data.tiles) return false;

      const validModes: TileMode[] = [
        "editor",
        "preview",
        "reference",
        "aichat",
        "missing",
      ];

      // Per SPEC.md §5.5: on layout restore, every tile whose bound file
      // no longer exists transitions to Missing mode with its original
      // path preserved as missingPath.
      const entries = Object.entries(data.tiles);
      const existenceChecks = await Promise.all(
        entries.map(async ([, t]) => {
          if (!t.filePath) return true;
          try {
            return await invoke<boolean>("file_exists", { path: t.filePath });
          } catch {
            return false;
          }
        }),
      );

      const tiles: Record<string, TileState> = {};
      entries.forEach(([id, t], idx) => {
        const mode = (t.mode ?? t.type ?? "editor") as TileMode;
        const resolvedMode = validModes.includes(mode) ? mode : "editor";
        const fileExists = existenceChecks[idx];

        if (t.filePath && !fileExists && resolvedMode !== "missing") {
          tiles[id] = {
            id,
            mode: "missing",
            filePath: null,
            missingPath: t.filePath,
          };
        } else {
          tiles[id] = {
            id,
            mode: resolvedMode,
            filePath: t.filePath,
            missingPath: t.missingPath,
          };
        }
      });

      const leafIds = getLeaves(data.tree);
      for (const id of leafIds) {
        if (!tiles[id]) return false;
      }

      set({
        mosaicTree: data.tree,
        tiles,
        focusedTileId: leafIds[0] ?? null,
      });
      return true;
    } catch {
      return false;
    }
  },

  setStatusMessage: (msg) => {
    if (_statusTimer) clearTimeout(_statusTimer);
    set({ statusMessage: msg });
    if (msg) {
      _statusTimer = setTimeout(() => {
        set({ statusMessage: null });
        _statusTimer = null;
      }, 3000);
    }
  },

  toggleWordWrap: (tileId) => {
    set((state) => ({
      wordWrap: {
        ...state.wordWrap,
        [tileId]: !(state.wordWrap[tileId] ?? true),
      },
    }));
  },

  setCxPrefixActive: (active) => {
    set({ cxPrefixActive: active });
  },

  countTilesForFile: (filePath) => {
    const { tiles } = get();
    return Object.values(tiles).filter(
      (t) => t.filePath === filePath && t.mode !== "missing",
    ).length;
  },

  isLastTileForFile: (tileId) => {
    const { tiles } = get();
    const tile = tiles[tileId];
    if (!tile?.filePath) return false;
    const count = Object.values(tiles).filter(
      (t) => t.filePath === tile.filePath && t.mode !== "missing",
    ).length;
    return count <= 1;
  },

  setPendingDialog: (dialog) => {
    set({ pendingDialog: dialog });
  },

  collectDirtyBuffers: (dirtyTiles) => {
    const { tiles } = get();
    const seen = new Map<string, string>();
    for (const [tileId, isDirty] of Object.entries(dirtyTiles)) {
      if (!isDirty) continue;
      const tile = tiles[tileId];
      if (!tile?.filePath || tile.mode === "missing") continue;
      if (!seen.has(tile.filePath)) {
        seen.set(tile.filePath, tileId);
      }
    }
    return Array.from(seen.entries()).map(
      ([filePath, representativeTileId]) => ({ filePath, representativeTileId }),
    );
  },
}));

function getOtherBranch(
  tree: MosaicNode<string>,
  path: MosaicBranch[],
): MosaicNode<string> {
  let node: MosaicNode<string> = tree;
  for (let i = 0; i < path.length - 1; i++) {
    if (typeof node === "string") break;
    node = node[path[i]];
  }
  if (typeof node === "string") return node;
  const branch = path[path.length - 1];
  return branch === "first" ? node.second : node.first;
}

export default useLayoutStore;
