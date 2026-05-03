// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach, vi } from "vitest";
import useLayoutStore from "../../src/stores/layoutStore";
import useProjectStore from "../../src/stores/projectStore";
import useEditorStore from "../../src/stores/editorStore";
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
    pendingDialog: null,
  });
  useProjectStore.setState({ projectDir: null });
  useEditorStore.setState({
    ydocs: {},
    dirtyStates: {},
    autosaveTimers: {},
    cursorLines: {},
  });
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
      expect(tileList.some((t) => t.mode === "editor")).toBe(true);
      expect(tileList.some((t) => t.mode === "preview")).toBe(true);
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
        (t) => t.mode === "editor",
      )!.id;
      const before = getLeaves(useLayoutStore.getState().mosaicTree!).length;

      useLayoutStore.getState().splitTile(editorId, "row");

      const after = getLeaves(useLayoutStore.getState().mosaicTree!).length;
      expect(after).toBe(before + 1);
    });

    it("creates a new tile of the same type as the split tile", () => {
      useLayoutStore.getState().initDefaultLayout();
      const previewId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.mode === "preview",
      )!.id;

      useLayoutStore.getState().splitTile(previewId, "column");

      const newTiles = Object.values(useLayoutStore.getState().tiles).filter(
        (t) => t.mode === "preview",
      );
      expect(newTiles.length).toBe(2);
    });

    it("supports deeply nested splits (8 levels) without depth limit", () => {
      useLayoutStore.getState().initDefaultLayout();

      let currentId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.mode === "editor",
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
      const editorId = Object.values(tiles).find((t) => t.mode === "editor")!.id;

      useLayoutStore.getState().closeTile(editorId);

      const remaining = getLeaves(useLayoutStore.getState().mosaicTree!);
      expect(remaining).not.toContain(editorId);
      expect(remaining.length).toBe(1);
    });

    it("does not close the last tile", () => {
      useLayoutStore.setState({
        mosaicTree: "editor-1",
        tiles: { "editor-1": { id: "editor-1", mode: "editor", filePath: null } },
      });

      useLayoutStore.getState().closeTile("editor-1");

      expect(useLayoutStore.getState().mosaicTree).toBe("editor-1");
    });
  });

  describe("togglePin", () => {
    it("pins an editor tile", () => {
      useLayoutStore.setState({
        tiles: { "editor-1": { id: "editor-1", mode: "editor", filePath: null } },
        pinnedTileId: null,
      });

      useLayoutStore.getState().togglePin("editor-1");

      expect(useLayoutStore.getState().pinnedTileId).toBe("editor-1");
    });

    it("unpins a tile when toggled again", () => {
      useLayoutStore.setState({
        tiles: { "editor-1": { id: "editor-1", mode: "editor", filePath: null } },
        pinnedTileId: "editor-1",
      });

      useLayoutStore.getState().togglePin("editor-1");

      expect(useLayoutStore.getState().pinnedTileId).toBeNull();
    });

    it("pinning a second tile unpins the first", () => {
      useLayoutStore.setState({
        tiles: {
          "editor-1": { id: "editor-1", mode: "editor", filePath: null },
          "editor-2": { id: "editor-2", mode: "editor", filePath: null },
        },
        pinnedTileId: "editor-1",
      });

      useLayoutStore.getState().togglePin("editor-2");

      expect(useLayoutStore.getState().pinnedTileId).toBe("editor-2");
    });

    it("does not pin a preview tile", () => {
      useLayoutStore.setState({
        tiles: { "preview-1": { id: "preview-1", mode: "preview", filePath: null } },
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
        (t) => t.mode === "editor",
      )!.id;

      useLayoutStore.getState().toggleMaximize(editorId);

      expect(useLayoutStore.getState().mosaicTree).toBe(editorId);
      expect(useLayoutStore.getState().maximizedTileId).toBe(editorId);
    });

    it("restores the tree when toggled again", () => {
      useLayoutStore.getState().initDefaultLayout();
      const originalTree = useLayoutStore.getState().mosaicTree;
      const editorId = Object.values(useLayoutStore.getState().tiles).find(
        (t) => t.mode === "editor",
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
        (t) => t.mode === "editor",
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
        (t) => t.mode === "editor",
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
        (t) => t.mode === "editor",
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
        (t) => t.mode === "editor",
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
        (t) => t.mode === "editor",
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
        (t) => t.mode === "editor",
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
        (t) => t.mode === "editor",
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

  // -------------------------------------------------------------------------
  // SPEC.md §4.0.1 — last-tile release guard
  // -------------------------------------------------------------------------

  describe("requestCloseTile", () => {
    beforeEach(() => {
      // Two editor tiles bound to distinct files, plus a row-split tree
      useLayoutStore.setState({
        mosaicTree: {
          direction: "row",
          first: "editor-1",
          second: "editor-2",
          splitPercentage: 50,
        },
        tiles: {
          "editor-1": { id: "editor-1", mode: "editor", filePath: "/p/a.md" },
          "editor-2": { id: "editor-2", mode: "editor", filePath: "/p/b.md" },
        },
        focusedTileId: "editor-1",
      });
    });

    it("closes immediately when buffer is clean", () => {
      useLayoutStore.getState().requestCloseTile("editor-1");
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      expect(useLayoutStore.getState().tiles["editor-1"]).toBeUndefined();
    });

    it("opens Save/Discard/Cancel dialog when last tile of a dirty buffer", () => {
      useEditorStore.getState().setDirty("editor-1", true);
      useLayoutStore.getState().requestCloseTile("editor-1");
      const pending = useLayoutStore.getState().pendingDialog;
      expect(pending?.kind).toBe("close");
      if (pending?.kind === "close") {
        expect(pending.tileId).toBe("editor-1");
        expect(pending.filePath).toBe("/p/a.md");
      }
      // The tile itself must still exist — close is deferred
      expect(useLayoutStore.getState().tiles["editor-1"]).toBeDefined();
    });

    it("closes without prompting when another tile still holds the buffer", () => {
      // Rebind editor-2 to the same file as editor-1
      useLayoutStore.setState({
        tiles: {
          "editor-1": { id: "editor-1", mode: "editor", filePath: "/p/a.md" },
          "editor-2": { id: "editor-2", mode: "editor", filePath: "/p/a.md" },
        },
      });
      useEditorStore.getState().setDirty("editor-1", true);
      useLayoutStore.getState().requestCloseTile("editor-1");
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      expect(useLayoutStore.getState().tiles["editor-1"]).toBeUndefined();
    });

    it("skips the guard for Missing tiles", () => {
      useLayoutStore.setState({
        tiles: {
          "editor-1": {
            id: "editor-1",
            mode: "missing",
            filePath: null,
            missingPath: "/p/a.md",
          },
          "editor-2": { id: "editor-2", mode: "editor", filePath: "/p/b.md" },
        },
      });
      useEditorStore.getState().setDirty("editor-1", true);
      useLayoutStore.getState().requestCloseTile("editor-1");
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      expect(useLayoutStore.getState().tiles["editor-1"]).toBeUndefined();
    });
  });

  describe("requestSetTileFile", () => {
    beforeEach(() => {
      useLayoutStore.setState({
        mosaicTree: "editor-1",
        tiles: {
          "editor-1": { id: "editor-1", mode: "editor", filePath: "/p/a.md" },
        },
        focusedTileId: "editor-1",
      });
    });

    it("applies immediately when buffer is clean", () => {
      const applied = useLayoutStore
        .getState()
        .requestSetTileFile("editor-1", "/p/b.md");
      expect(applied).toBe(true);
      expect(useLayoutStore.getState().tiles["editor-1"].filePath).toBe(
        "/p/b.md",
      );
    });

    it("opens a buffer-release dialog when switching a last-of-dirty tile", () => {
      useEditorStore.getState().setDirty("editor-1", true);
      const applied = useLayoutStore
        .getState()
        .requestSetTileFile("editor-1", "/p/b.md", "preview");
      expect(applied).toBe(false);
      const pending = useLayoutStore.getState().pendingDialog;
      expect(pending?.kind).toBe("buffer");
      if (pending?.kind === "buffer") {
        expect(pending.tileId).toBe("editor-1");
        expect(pending.newFilePath).toBe("/p/b.md");
        expect(pending.newMode).toBe("preview");
        expect(pending.oldFilePath).toBe("/p/a.md");
      }
      // Binding should not have changed yet
      expect(useLayoutStore.getState().tiles["editor-1"].filePath).toBe(
        "/p/a.md",
      );
      expect(useLayoutStore.getState().tiles["editor-1"].mode).toBe("editor");
    });

    it("treats same-file set as a no-op release (no dialog)", () => {
      useEditorStore.getState().setDirty("editor-1", true);
      const applied = useLayoutStore
        .getState()
        .requestSetTileFile("editor-1", "/p/a.md", "preview");
      expect(applied).toBe(true);
      expect(useLayoutStore.getState().pendingDialog).toBeNull();
      expect(useLayoutStore.getState().tiles["editor-1"].mode).toBe("preview");
    });
  });

  describe("collectDirtyBuffers", () => {
    it("deduplicates by filePath across multiple dirty tiles", () => {
      useLayoutStore.setState({
        tiles: {
          "editor-1": { id: "editor-1", mode: "editor", filePath: "/p/a.md" },
          "editor-2": { id: "editor-2", mode: "editor", filePath: "/p/a.md" },
          "editor-3": { id: "editor-3", mode: "editor", filePath: "/p/b.md" },
        },
      });
      const dirty = useLayoutStore.getState().collectDirtyBuffers({
        "editor-1": true,
        "editor-2": true,
        "editor-3": true,
      });
      expect(dirty.length).toBe(2);
      const paths = dirty.map((d) => d.filePath).sort();
      expect(paths).toEqual(["/p/a.md", "/p/b.md"]);
    });

    it("skips Missing tiles and clean tiles", () => {
      useLayoutStore.setState({
        tiles: {
          "editor-1": { id: "editor-1", mode: "editor", filePath: "/p/a.md" },
          "editor-2": {
            id: "editor-2",
            mode: "missing",
            filePath: null,
            missingPath: "/p/b.md",
          },
        },
      });
      const dirty = useLayoutStore.getState().collectDirtyBuffers({
        "editor-1": false,
        "editor-2": true,
      });
      expect(dirty).toEqual([]);
    });

    it("skips tiles whose Y.Doc content matches savedContents (defense-in-depth)", () => {
      // Simulate a stale dirty flag: dirtyStates says dirty, but Y.Doc = saved baseline.
      useLayoutStore.setState({
        tiles: {
          "editor-1": { id: "editor-1", mode: "editor", filePath: "/p/a.md" },
        },
      });
      // Plant a Y.Doc with content equal to savedContents.
      const ydoc = useEditorStore.getState().getOrCreateYDoc("/p/a.md");
      ydoc.getText("content").insert(0, "clean content");
      useEditorStore.getState().setSavedContent("/p/a.md", "clean content");

      const dirty = useLayoutStore.getState().collectDirtyBuffers({ "editor-1": true });
      expect(dirty).toEqual([]);
    });

    it("includes tiles whose Y.Doc content differs from savedContents", () => {
      useLayoutStore.setState({
        tiles: {
          "editor-1": { id: "editor-1", mode: "editor", filePath: "/p/a.md" },
        },
      });
      const ydoc = useEditorStore.getState().getOrCreateYDoc("/p/a.md");
      ydoc.getText("content").insert(0, "modified content");
      useEditorStore.getState().setSavedContent("/p/a.md", "original content");

      const dirty = useLayoutStore.getState().collectDirtyBuffers({ "editor-1": true });
      expect(dirty.length).toBe(1);
      expect(dirty[0].filePath).toBe("/p/a.md");
    });
  });

  // -------------------------------------------------------------------------
  // SPEC.md §5.5 — layout restore verifies file existence
  // -------------------------------------------------------------------------

  describe("loadLayout — duplicate leaf IDs", () => {
    beforeEach(() => {
      getInvokeMock().mockReset();
    });

    it("returns false and shows a status message when the tree has duplicate leaf IDs", async () => {
      const persisted = {
        tree: {
          direction: "row",
          first: {
            direction: "column",
            first: "editor-1",
            second: "editor-1", // duplicate
            splitPercentage: 50,
          },
          second: "preview-2",
          splitPercentage: 50,
        },
        tiles: {
          "editor-1": { mode: "editor", filePath: "/p/a.md" },
          "preview-2": { mode: "preview", filePath: "/p/a.md" },
        },
      };
      getInvokeMock().mockImplementation(async (cmd: string) => {
        if (cmd === "load_layout") return JSON.stringify(persisted);
        if (cmd === "file_exists") return true;
        return undefined;
      });

      const restored = await useLayoutStore.getState().loadLayout("/p");
      expect(restored).toBe(false);
      // mosaicTree must NOT have been set to the broken tree
      expect(useLayoutStore.getState().mosaicTree).toBeNull();
      // A status message should inform the user
      expect(useLayoutStore.getState().statusMessage).toBeTruthy();
    });
  });

  describe("loadLayout with missing files", () => {
    beforeEach(() => {
      getInvokeMock().mockReset();
    });

    it("transitions tiles whose bound files are gone to Missing mode", async () => {
      const persisted = {
        tree: {
          direction: "row",
          first: "editor-1",
          second: "editor-2",
          splitPercentage: 50,
        },
        tiles: {
          "editor-1": { mode: "editor", filePath: "/p/exists.md" },
          "editor-2": { mode: "editor", filePath: "/p/deleted.md" },
        },
      };
      getInvokeMock().mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "load_layout") return JSON.stringify(persisted);
        if (cmd === "file_exists") {
          return args.path === "/p/exists.md";
        }
        return undefined;
      });

      const restored = await useLayoutStore.getState().loadLayout("/p");
      expect(restored).toBe(true);

      const tiles = useLayoutStore.getState().tiles;
      expect(tiles["editor-1"].mode).toBe("editor");
      expect(tiles["editor-1"].filePath).toBe("/p/exists.md");

      expect(tiles["editor-2"].mode).toBe("missing");
      expect(tiles["editor-2"].filePath).toBeNull();
      expect(tiles["editor-2"].missingPath).toBe("/p/deleted.md");
    });
  });
});
