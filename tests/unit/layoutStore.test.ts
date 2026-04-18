// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach, vi } from "vitest";
import useLayoutStore from "../../src/stores/layoutStore";
import useProjectStore from "../../src/stores/projectStore";
import { getLeaves } from "react-mosaic-component";

function resetStore() {
  useLayoutStore.setState({
    mosaicTree: null,
    tiles: {},
    focusedTileId: null,
    pinnedTileId: null,
    sidebarVisible: true,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 0,
  });
  useProjectStore.setState({ projectDir: null });
}

beforeEach(resetStore);

// Access the mocked Tauri invoke set up in tests/unit/setup.ts
function getInvokeMock() {
  return (
    window as unknown as { __TAURI_INTERNALS__: { invoke: ReturnType<typeof vi.fn> } }
  ).__TAURI_INTERNALS__.invoke;
}

describe("layoutStore", () => {
  describe("initDefaultLayout", () => {
    it("creates two tiles: one editor and one preview", () => {
      useLayoutStore.getState().initDefaultLayout();
      const { tiles, mosaicTree } = useLayoutStore.getState();
      const tileList = Object.values(tiles);
      expect(tileList.length).toBe(2);
      expect(tileList.some((t) => t.type === "editor")).toBe(true);
      expect(tileList.some((t) => t.type === "preview")).toBe(true);
      expect(mosaicTree).not.toBeNull();
    });

    it("sets the mosaic tree as a row-split", () => {
      useLayoutStore.getState().initDefaultLayout();
      const { mosaicTree } = useLayoutStore.getState();
      expect(typeof mosaicTree).toBe("object");
      if (typeof mosaicTree === "object" && mosaicTree !== null) {
        expect(mosaicTree.direction).toBe("row");
      }
    });
  });

  describe("splitTile", () => {
    it("adds a new tile and splits the tree", () => {
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;
      const before = getLeaves(useLayoutStore.getState().mosaicTree!).length;

      useLayoutStore.getState().splitTile(editorId, "row");

      const after = getLeaves(useLayoutStore.getState().mosaicTree!).length;
      expect(after).toBe(before + 1);
    });

    it("creates a new tile of the same type as the split tile", () => {
      useLayoutStore.getState().initDefaultLayout();
      const previewId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "preview",
      )!.id;

      useLayoutStore.getState().splitTile(previewId, "column");

      const newTiles = Object.values(useLayoutStore.getState().tiles).filter(
        (t) => t.type === "preview",
      );
      expect(newTiles.length).toBe(2);
    });

    it("supports deeply nested splits (8 levels) without depth limit", () => {
      useLayoutStore.getState().initDefaultLayout();

      let currentId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;

      const depth = 8;
      for (let i = 0; i < depth; i++) {
        const direction = i % 2 === 0 ? "row" : "column";
        useLayoutStore.getState().splitTile(currentId, direction as "row" | "column");
        currentId = useLayoutStore.getState().focusedTileId!;
        expect(currentId).toBeDefined();
      }

      const leaves = getLeaves(useLayoutStore.getState().mosaicTree!);
      expect(leaves.length).toBe(2 + depth);

      function measureDepth(node: unknown): number {
        if (typeof node === "string") return 0;
        const n = node as { first: unknown; second: unknown };
        return 1 + Math.max(measureDepth(n.first), measureDepth(n.second));
      }

      const treeDepth = measureDepth(useLayoutStore.getState().mosaicTree);
      expect(treeDepth).toBe(1 + depth);
    });
  });

  describe("closeTile", () => {
    it("removes the tile from the layout", () => {
      useLayoutStore.getState().initDefaultLayout();
      const { tiles } = useLayoutStore.getState();
      const editorId = Object.values(tiles).find((t) => t.type === "editor")!.id;

      useLayoutStore.getState().closeTile(editorId);

      const remaining = getLeaves(useLayoutStore.getState().mosaicTree!);
      expect(remaining).not.toContain(editorId);
      expect(remaining.length).toBe(1);
    });

    it("does not close the last tile", () => {
      useLayoutStore.setState({
        mosaicTree: "editor-1",
        tiles: { "editor-1": { id: "editor-1", type: "editor", filePath: null } },
      });

      useLayoutStore.getState().closeTile("editor-1");

      expect(useLayoutStore.getState().mosaicTree).toBe("editor-1");
    });
  });

  describe("togglePin", () => {
    it("pins an editor tile", () => {
      useLayoutStore.setState({
        tiles: { "editor-1": { id: "editor-1", type: "editor", filePath: null } },
        pinnedTileId: null,
      });

      useLayoutStore.getState().togglePin("editor-1");

      expect(useLayoutStore.getState().pinnedTileId).toBe("editor-1");
    });

    it("unpins a tile when toggled again", () => {
      useLayoutStore.setState({
        tiles: { "editor-1": { id: "editor-1", type: "editor", filePath: null } },
        pinnedTileId: "editor-1",
      });

      useLayoutStore.getState().togglePin("editor-1");

      expect(useLayoutStore.getState().pinnedTileId).toBeNull();
    });

    it("pinning a second tile unpins the first", () => {
      useLayoutStore.setState({
        tiles: {
          "editor-1": { id: "editor-1", type: "editor", filePath: null },
          "editor-2": { id: "editor-2", type: "editor", filePath: null },
        },
        pinnedTileId: "editor-1",
      });

      useLayoutStore.getState().togglePin("editor-2");

      expect(useLayoutStore.getState().pinnedTileId).toBe("editor-2");
    });

    it("does not pin a preview tile", () => {
      useLayoutStore.setState({
        tiles: { "preview-1": { id: "preview-1", type: "preview", filePath: null } },
        pinnedTileId: null,
      });

      useLayoutStore.getState().togglePin("preview-1");

      expect(useLayoutStore.getState().pinnedTileId).toBeNull();
    });
  });

  describe("toggleMaximize", () => {
    it("maximizes a tile by replacing the tree with that leaf", () => {
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;

      useLayoutStore.getState().toggleMaximize(editorId);

      expect(useLayoutStore.getState().mosaicTree).toBe(editorId);
      expect(useLayoutStore.getState().maximizedTileId).toBe(editorId);
    });

    it("restores the tree when toggled again", () => {
      useLayoutStore.getState().initDefaultLayout();
      const originalTree = useLayoutStore.getState().mosaicTree;
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;

      useLayoutStore.getState().toggleMaximize(editorId);
      useLayoutStore.getState().toggleMaximize(editorId);

      expect(useLayoutStore.getState().mosaicTree).toEqual(originalTree);
      expect(useLayoutStore.getState().maximizedTileId).toBeNull();
    });
  });

  describe("focusNextTile", () => {
    it("cycles through tiles", () => {
      useLayoutStore.getState().initDefaultLayout();
      const ids = Object.keys(useLayoutStore.getState().tiles);
      const first = useLayoutStore.getState().focusedTileId;

      useLayoutStore.getState().focusNextTile();

      const second = useLayoutStore.getState().focusedTileId;
      expect(second).not.toBe(first);
      expect(ids).toContain(second);
    });
  });

  describe("toggleSidebar", () => {
    it("toggles sidebar visibility", () => {
      expect(useLayoutStore.getState().sidebarVisible).toBe(true);
      useLayoutStore.getState().toggleSidebar();
      expect(useLayoutStore.getState().sidebarVisible).toBe(false);
      useLayoutStore.getState().toggleSidebar();
      expect(useLayoutStore.getState().sidebarVisible).toBe(true);
    });
  });

  describe("auto-persist on structural change", () => {
    async function flushPersistTimer(): Promise<void> {
      await vi.advanceTimersByTimeAsync(300);
    }

    beforeEach(() => {
      vi.useFakeTimers();
      getInvokeMock().mockClear();
    });

    it("does not invoke save_layout when no project dir is set", async () => {
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;
      useLayoutStore.getState().splitTile(editorId, "row");
      await flushPersistTimer();
      vi.useRealTimers();
      const saveCall = getInvokeMock().mock.calls.find(
        (c) => c[0] === "save_layout",
      );
      expect(saveCall).toBeUndefined();
    });

    it("invokes save_layout after splitTile when a project is loaded", async () => {
      useProjectStore.setState({ projectDir: "/proj" });
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;
      getInvokeMock().mockClear();
      useLayoutStore.getState().splitTile(editorId, "row");
      await flushPersistTimer();
      vi.useRealTimers();
      const saveCall = getInvokeMock().mock.calls.find(
        (c) => c[0] === "save_layout",
      );
      expect(saveCall).toBeDefined();
    });

    it("invokes save_layout after closeTile", async () => {
      useProjectStore.setState({ projectDir: "/proj" });
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;
      getInvokeMock().mockClear();
      useLayoutStore.getState().closeTile(editorId);
      await flushPersistTimer();
      vi.useRealTimers();
      expect(
        getInvokeMock().mock.calls.some((c) => c[0] === "save_layout"),
      ).toBe(true);
    });

    it("invokes save_layout after toggleMaximize", async () => {
      useProjectStore.setState({ projectDir: "/proj" });
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;
      getInvokeMock().mockClear();
      useLayoutStore.getState().toggleMaximize(editorId);
      await flushPersistTimer();
      vi.useRealTimers();
      expect(
        getInvokeMock().mock.calls.some((c) => c[0] === "save_layout"),
      ).toBe(true);
    });

    it("invokes save_layout after setTileFile", async () => {
      useProjectStore.setState({ projectDir: "/proj" });
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;
      getInvokeMock().mockClear();
      useLayoutStore.getState().setTileFile(editorId, "/proj/note.md");
      await flushPersistTimer();
      vi.useRealTimers();
      expect(
        getInvokeMock().mock.calls.some((c) => c[0] === "save_layout"),
      ).toBe(true);
    });

    it("invokes save_layout after setMosaicTree", async () => {
      useProjectStore.setState({ projectDir: "/proj" });
      useLayoutStore.getState().initDefaultLayout();
      const tree = useLayoutStore.getState().mosaicTree;
      getInvokeMock().mockClear();
      useLayoutStore.getState().setMosaicTree(tree);
      await flushPersistTimer();
      vi.useRealTimers();
      expect(
        getInvokeMock().mock.calls.some((c) => c[0] === "save_layout"),
      ).toBe(true);
    });

    it("does NOT persist on togglePin (pin state is transient)", async () => {
      useProjectStore.setState({ projectDir: "/proj" });
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;
      getInvokeMock().mockClear();
      useLayoutStore.getState().togglePin(editorId);
      await flushPersistTimer();
      vi.useRealTimers();
      const saveCall = getInvokeMock().mock.calls.find(
        (c) => c[0] === "save_layout",
      );
      expect(saveCall).toBeUndefined();
    });

    it("debounces multiple rapid changes into a single write", async () => {
      useProjectStore.setState({ projectDir: "/proj" });
      useLayoutStore.getState().initDefaultLayout();
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.type === "editor",
      )!.id;
      getInvokeMock().mockClear();
      // Three structural changes in rapid succession
      useLayoutStore.getState().splitTile(editorId, "row");
      const ids = Object.keys(useLayoutStore.getState().tiles);
      useLayoutStore.getState().splitTile(ids[ids.length - 1], "column");
      const ids2 = Object.keys(useLayoutStore.getState().tiles);
      useLayoutStore.getState().setTileFile(ids2[0], "/proj/a.md");
      await flushPersistTimer();
      vi.useRealTimers();
      const saveCalls = getInvokeMock().mock.calls.filter(
        (c) => c[0] === "save_layout",
      );
      expect(saveCalls.length).toBe(1);
    });
  });
});
