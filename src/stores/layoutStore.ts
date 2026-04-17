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

export type TileType = "editor" | "preview";

export interface TileState {
  id: string;
  type: TileType;
  filePath: string | null;
}

/** Serialized layout persisted to layout.json */
interface PersistedLayout {
  tree: MosaicNode<string> | null;
  tiles: Record<string, { type: TileType; filePath: string | null }>;
}

interface LayoutStoreState {
  mosaicTree: MosaicNode<string> | null;
  tiles: Record<string, TileState>;
  focusedTileId: string | null;
  pinnedTileId: string | null;
  sidebarVisible: boolean;
  /** ID of maximized tile; if set, only that tile is shown */
  maximizedTileId: string | null;
  /** Saved tree before maximization, for restore */
  savedTreeBeforeMaximize: MosaicNode<string> | null;
  tileCounter: number;

  // Getters
  getTileIds: () => string[];
  getOrderedTileIds: () => string[];

  // Actions
  initDefaultLayout: () => void;
  setMosaicTree: (tree: MosaicNode<string> | null) => void;
  splitTile: (tileId: string, direction: "row" | "column") => void;
  closeTile: (tileId: string) => void;
  focusTile: (tileId: string) => void;
  focusNextTile: () => void;
  togglePin: (tileId: string) => void;
  toggleSidebar: () => void;
  toggleMaximize: (tileId: string) => void;
  setTileFile: (tileId: string, filePath: string) => void;
  createTile: (type: TileType, filePath?: string | null) => string;
  persistLayout: (projectDir: string) => Promise<void>;
  loadLayout: (projectDir: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Tree traversal helpers
// ---------------------------------------------------------------------------

/** Walk the tree and collect leaf IDs in left-to-right, top-to-bottom order. */
function collectLeaves(tree: MosaicNode<string>): string[] {
  if (typeof tree === "string") return [tree];
  return [...collectLeaves(tree.first), ...collectLeaves(tree.second)];
}

/** Find the path (array of MosaicBranch) to a given leaf ID. Returns null if not found. */
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
function nextTileId(type: TileType): string {
  _tileCounter += 1;
  return `${type}-${_tileCounter}`;
}

// Debounced auto-persist: structural mutations schedule a write to layout.json.
// Fire-and-forget — the Tauri IPC call inside `persistLayout` already swallows
// errors so the UI is never blocked.
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

const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  mosaicTree: null,
  tiles: {},
  focusedTileId: null,
  pinnedTileId: null,
  sidebarVisible: true,
  maximizedTileId: null,
  savedTreeBeforeMaximize: null,
  tileCounter: 0,

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

  initDefaultLayout: () => {
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
        [editorId]: { id: editorId, type: "editor", filePath: null },
        [previewId]: { id: previewId, type: "preview", filePath: null },
      },
      focusedTileId: editorId,
    });
  },

  setMosaicTree: (tree) => {
    set({ mosaicTree: tree });
    // If a tile was removed from the tree, clean up tiles map
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

    const focusedType = tiles[tileId]?.type ?? "editor";
    const newId = nextTileId(focusedType);

    // Build the split subtree
    const splitNode: MosaicNode<string> = {
      direction,
      first: tileId,
      second: newId,
      splitPercentage: 50,
    };

    // Replace the leaf with the split node
    const newTree = updateTree(mosaicTree, [
      {
        path,
        spec: { $set: splitNode },
      },
    ]);

    const newTile: TileState = {
      id: newId,
      type: focusedType,
      filePath: tiles[tileId]?.filePath ?? null,
    };

    set((state) => ({
      mosaicTree: newTree,
      tiles: { ...state.tiles, [newId]: newTile },
      focusedTileId: newId,
    }));
    schedulePersist();
  },

  closeTile: (tileId) => {
    const { mosaicTree, tiles } = get();
    if (!mosaicTree) return;
    if (typeof mosaicTree === "string") {
      // Last tile — don't close
      return;
    }

    const path = getPathToLeaf(mosaicTree, tileId);
    if (path === null) return;

    // Can't close the last tile
    const leaves = getLeaves(mosaicTree);
    if (leaves.length <= 1) return;

    // Navigate to parent and replace the parent with the sibling
    if (path.length === 0) return;

    // Use updateTree to remove the node
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

    const newFocused =
      leaves.find((id) => id !== tileId) ?? null;

    set({
      mosaicTree: newTree,
      tiles: newTiles,
      focusedTileId: newFocused,
      pinnedTileId: get().pinnedTileId === tileId ? null : get().pinnedTileId,
    });
    schedulePersist();
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

  togglePin: (tileId) => {
    const { tiles, pinnedTileId } = get();
    const tile = tiles[tileId];
    if (!tile || tile.type !== "editor") return;
    if (pinnedTileId === tileId) {
      set({ pinnedTileId: null });
    } else {
      set({ pinnedTileId: tileId });
    }
    // Pin state is transient (SPEC §8.1) — intentionally not persisted.
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarVisible: !state.sidebarVisible }));
  },

  toggleMaximize: (tileId) => {
    const { maximizedTileId, mosaicTree } = get();
    if (maximizedTileId === tileId) {
      // Restore
      const saved = get().savedTreeBeforeMaximize;
      set({
        maximizedTileId: null,
        mosaicTree: saved ?? mosaicTree,
        savedTreeBeforeMaximize: null,
      });
    } else {
      // Maximize — replace tree with just this tile
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
        [tileId]: { ...state.tiles[tileId], filePath },
      },
    }));
    schedulePersist();
  },

  createTile: (type, filePath = null) => {
    const id = nextTileId(type);
    set((state) => ({
      tiles: { ...state.tiles, [id]: { id, type, filePath } },
      tileCounter: state.tileCounter + 1,
    }));
    return id;
  },

  persistLayout: async (projectDir) => {
    const { mosaicTree, tiles, savedTreeBeforeMaximize } = get();
    // Persist the "real" tree (before any maximize transformation)
    const treeToSave = savedTreeBeforeMaximize ?? mosaicTree;
    const payload: PersistedLayout = {
      tree: treeToSave,
      tiles: Object.fromEntries(
        Object.entries(tiles).map(([id, t]) => [
          id,
          { type: t.type, filePath: t.filePath },
        ]),
      ),
    };
    try {
      await invoke("save_layout", {
        projectDir,
        layoutJson: JSON.stringify(payload),
      });
    } catch {
      // Non-fatal: layout will be lost on reopen but data is safe
    }
  },

  loadLayout: async (projectDir) => {
    try {
      const json = await invoke<string | null>("load_layout", { projectDir });
      if (!json) return false;
      const data: PersistedLayout = JSON.parse(json);
      if (!data.tree || !data.tiles) return false;

      const tiles: Record<string, TileState> = {};
      for (const [id, t] of Object.entries(data.tiles)) {
        tiles[id] = { id, type: t.type, filePath: t.filePath };
      }

      // Validate that all leaf IDs in the tree have corresponding tile entries
      const leafIds = getLeaves(data.tree);
      for (const id of leafIds) {
        if (!tiles[id]) return false; // corrupted layout
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
}));

// ---------------------------------------------------------------------------
// Helper: get the "other" branch of the parent at `path`
// ---------------------------------------------------------------------------
function getOtherBranch(
  tree: MosaicNode<string>,
  path: MosaicBranch[],
): MosaicNode<string> {
  // Navigate to the parent
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
