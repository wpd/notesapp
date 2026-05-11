// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openFileDialog } from "./utils/dialogs";

import useProjectStore from "./stores/projectStore";
import useLayoutStore, { TileMode } from "./stores/layoutStore";
import useEditorStore from "./stores/editorStore";
import MosaicLayout from "./components/MosaicLayout";
import ActivitySidebar from "./components/ActivitySidebar";
import BufferSwitcher, { PickerMode } from "./components/BufferSwitcher";
import RecoveryDialog from "./components/RecoveryDialog";
import UnsavedChangesDialog from "./components/UnsavedChangesDialog";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

// ---------------------------------------------------------------------------
// Project loading screen
// ---------------------------------------------------------------------------

function ProjectLoader({
  onProjectLoaded,
}: {
  onProjectLoaded: () => void;
}): React.ReactElement {
  // If boot() already pre-hydrated an error (env var was set but invalid),
  // start in the non-loading state so the chooser button is shown immediately
  // without any IPC round-trips.
  const preHydratedError = useProjectStore.getState().error;
  const [loading, setLoading] = useState(!preHydratedError);
  const [error, setError] = useState<string | null>(preHydratedError);
  const { setProjectDir } = useProjectStore();

  useEffect(() => {
    // If boot() pre-hydrated an error, skip tryAutoLoad entirely — the
    // on_page_load hook has already run open_project and got the same error.
    if (preHydratedError) return;

    async function tryAutoLoad() {
      try {
        const envDir = await invoke<string | null>("get_project_dir_env");
        if (envDir) {
          const ok = await setProjectDir(envDir);
          if (ok) {
            onProjectLoaded();
            return;
          }
          // Env var pointed at a broken project — surface the reason
          // and fall through to the chooser per ROADMAP §Phase 1.
          setError(useProjectStore.getState().error);
        }
      } catch {
        // Fall through to dialog
      }
      setLoading(false);
    }
    void tryAutoLoad();
  }, [setProjectDir, onProjectLoaded, preHydratedError]);

  // Run a chooser-pick through the same §6.1.1 resolution as the env var.
  // If the user picks a directory that classify_project_dir rejects,
  // surface the reason and reopen the chooser (ROADMAP §Phase 1).
  const handleChooseDir = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      while (true) {
        const selected = await openFileDialog({
          directory: true,
          multiple: false,
        });
        if (!selected) {
          setLoading(false);
          return;
        }
        const dir = typeof selected === "string" ? selected : selected[0];
        const ok = await setProjectDir(dir);
        if (ok) {
          onProjectLoaded();
          return;
        }
        setError(useProjectStore.getState().error);
        // Loop: chooser reopens so the user can pick a different directory.
      }
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }, [setProjectDir, onProjectLoaded]);

  if (loading) {
    return (
      <div
        data-testid="project-loader"
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-primary)",
          color: "var(--color-text-secondary)",
          fontFamily: "var(--font-prose)",
        }}
      >
        <p>Loading project…</p>
      </div>
    );
  }

  return (
    <div
      data-testid="project-loader"
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-primary)",
        gap: "1rem",
        fontFamily: "var(--font-prose)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-prose)",
          fontSize: "24px",
          color: "var(--color-text-primary)",
          fontWeight: 600,
        }}
      >
        NotesApp
      </h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
        Choose a project directory to get started.
      </p>
      {error && (
        <p style={{ color: "var(--color-error)", fontSize: "13px" }}>{error}</p>
      )}
      <button
        data-testid="choose-directory-button"
        onClick={handleChooseDir}
        style={{
          padding: "0.5rem 1.5rem",
          background: "var(--color-accent)",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "15px",
          cursor: "pointer",
          fontFamily: "var(--font-prose)",
        }}
      >
        Open Project Directory…
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell — rendered once the project is loaded
// ---------------------------------------------------------------------------

interface PreloadedData {
  dir: string;
  notes: Array<{ path: string; name: string; modified_at: number }>;
}

interface SwitcherState {
  pickerMode: PickerMode;
  targetTileId?: string;
  targetMode?: TileMode;
}

function AppShell(): React.ReactElement {
  const [switcherState, setSwitcherState] = useState<SwitcherState | null>(null);
  const [recoveryPaths, setRecoveryPaths] = useState<string[]>([]);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const projectDir = useProjectStore((s) => s.projectDir);
  const notes = useProjectStore((s) => s.notes);
  const statusMessage = useLayoutStore((s) => s.statusMessage);
  const {
    initDefaultLayout,
    loadLayout,
    setTileMissing,
    requestCloseTile,
    collectDirtyBuffers,
    setPendingDialog,
  } = useLayoutStore();
  const watcherStartedRef = useRef(false);

  // Hydrate Zustand from preloaded data
  useEffect(() => {
    if (useProjectStore.getState().isLoaded) return;
    const data = (
      window as Window & { __NOTESAPP_PRELOADED__?: PreloadedData }
    ).__NOTESAPP_PRELOADED__;
    if (data?.dir) {
      useProjectStore.setState({
        projectDir: data.dir,
        notes: data.notes ?? [],
        isLoaded: true,
        error: null,
      });
    }
  }, []);

  // Load persisted layout or init default with first note
  useEffect(() => {
    let active = true;
    async function load() {
      if (!projectDir) {
        initDefaultLayout();
        return;
      }
      let restored = false;
      try {
        restored = await Promise.race([
          loadLayout(projectDir),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), 3000),
          ),
        ]);
      } catch {
        restored = false;
      }
      if (active && !restored) {
        // Find the first note to bind to (default layout per SPEC §4.0.1)
        const firstNote = notes.length > 0 ? notes[0].path : undefined;
        initDefaultLayout(firstNote);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [projectDir, loadLayout, initDefaultLayout, notes]);

  // Start file watcher
  useEffect(() => {
    if (!projectDir || watcherStartedRef.current) return;
    watcherStartedRef.current = true;
    invoke("start_file_watcher", { projectDir }).catch(() => {
      // Non-fatal — file watcher is best-effort
    });
  }, [projectDir]);

  // Set OS window title to "NotesApp — <projectName>" when a project is open.
  useEffect(() => {
    if (!projectDir) return;
    const name = projectDir.split("/").filter(Boolean).pop() ?? "";
    let cancelled = false;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      if (cancelled) return;
      void getCurrentWindow().setTitle(name ? `NotesApp \u2014 ${name}` : "NotesApp");
    });
    return () => { cancelled = true; };
  }, [projectDir]);

  // Listen for file-change events from the watcher
  useEffect(() => {
    const unlisten = listen<{ kind: string; path: string }>(
      "file-change",
      (event) => {
        if (event.payload.kind === "delete") {
          const deletedPath = event.payload.path;
          const { tiles } = useLayoutStore.getState();
          for (const [tileId, tile] of Object.entries(tiles)) {
            if (tile.filePath === deletedPath && tile.mode !== "missing") {
              setTileMissing(tileId, deletedPath);
            }
          }
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setTileMissing]);

  // Shared quit logic: used by both the native close button and C-x C-c.
  const requestAppQuit = useCallback(async () => {
    const dirty = collectDirtyBuffers(useEditorStore.getState().dirtyStates);
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (dirty.length === 0) {
      void win.destroy();
      return;
    }
    setPendingDialog({
      kind: "quit",
      dirtyBuffers: dirty,
      onComplete: () => { void win.destroy(); },
    });
  }, [collectDirtyBuffers, setPendingDialog]);

  // SPEC.md §4.0.1 — consolidated quit dialog. Intercept the native window
  // close request. If any buffer is dirty, show the consolidated dialog;
  // otherwise allow the window to close.
  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | null = null;
    import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        if (!active) return;
        const win = getCurrentWindow();
        const unlisten = await win.onCloseRequested((event) => {
          const dirty = collectDirtyBuffers(
            useEditorStore.getState().dirtyStates,
          );
          if (dirty.length === 0) return;
          event.preventDefault();
          setPendingDialog({
            kind: "quit",
            dirtyBuffers: dirty,
            onComplete: () => {
              void win.destroy();
            },
          });
        });
        if (active) {
          unlistenFn = unlisten;
        } else {
          unlisten();
        }
      })
      .catch(() => {
        // Non-Tauri environment (tests) — no-op
      });
    return () => {
      active = false;
      unlistenFn?.();
    };
  }, [collectDirtyBuffers, setPendingDialog]);

  // Crash recovery scan
  useEffect(() => {
    if (!projectDir || recoveryDismissed) return;
    let active = true;
    invoke<string[]>("find_recovery_files", { projectDir })
      .then((paths) => {
        if (active && paths && paths.length > 0) {
          setRecoveryPaths(paths);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectDir, recoveryDismissed]);

  const handleCloseRecovery = useCallback(() => {
    setRecoveryPaths([]);
    setRecoveryDismissed(true);
  }, []);

  // Buffer switcher handlers
  const handleOpenBufferSwitcher = useCallback(
    (tileId: string, pickerMode: string) => {
      setSwitcherState({
        pickerMode: pickerMode as PickerMode,
        targetTileId: tileId,
      });
    },
    [],
  );

  const handleOpenFindFile = useCallback(() => {
    const focused = useLayoutStore.getState().focusedTileId;
    setSwitcherState({
      pickerMode: "find-file",
      targetTileId: focused ?? undefined,
    });
  }, []);

  const handleModeSwitch = useCallback(
    (tileId: string, mode: TileMode) => {
      if (mode === "reference") {
        setSwitcherState({
          pickerMode: "reference",
          targetTileId: tileId,
          targetMode: mode,
        });
        return;
      }
      if (mode === "aichat") {
        setSwitcherState({
          pickerMode: "aichat-stub",
          targetTileId: tileId,
          targetMode: mode,
        });
        return;
      }
      // Editor or Preview mode switch — open the appropriate picker
      const pickerMode: PickerMode =
        mode === "preview" ? "preview" : "editor";
      setSwitcherState({
        pickerMode,
        targetTileId: tileId,
        targetMode: mode,
      });
    },
    [],
  );

  const handleSwitcherClose = useCallback(() => {
    setSwitcherState(null);
  }, []);

  // Tile action handlers for MosaicLayout
  const handleOpenPicker = useCallback(
    (tileId: string) => {
      const tile = useLayoutStore.getState().tiles[tileId];
      if (!tile) return;
      const pickerMode: PickerMode =
        tile.mode === "preview"
          ? "preview"
          : tile.mode === "reference"
            ? "reference"
            : tile.mode === "aichat"
              ? "aichat-stub"
              : "editor";
      setSwitcherState({ pickerMode, targetTileId: tileId });
    },
    [],
  );

  const handleLocate = useCallback(
    async (tileId: string) => {
      const tile = useLayoutStore.getState().tiles[tileId];
      if (!tile?.missingPath) return;
      // Derive directory scope from the missing path
      let defaultDir = projectDir ?? undefined;
      if (tile.missingPath.includes("/notes/")) {
        defaultDir = projectDir ? `${projectDir}/notes` : undefined;
      } else if (tile.missingPath.includes("/references/")) {
        defaultDir = projectDir ? `${projectDir}/references` : undefined;
      } else if (tile.missingPath.includes("/ai-context/")) {
        defaultDir = projectDir
          ? `${projectDir}/.notesapp/ai-context`
          : undefined;
      }
      try {
        const selected = await openFileDialog({
          directory: false,
          multiple: false,
          defaultPath: defaultDir,
        });
        if (!selected) return;
        const filePath =
          typeof selected === "string" ? selected : selected[0];
        // Determine the new mode based on the file location
        let newMode: TileMode = "editor";
        if (filePath.includes("/references/")) {
          newMode = "reference";
        } else if (filePath.includes("/ai-context/")) {
          newMode = "aichat";
        }
        useLayoutStore.getState().setTileMode(tileId, newMode);
        useLayoutStore.getState().setTileFile(tileId, filePath);
        // Load Y.Doc
        const ydoc = useEditorStore.getState().getOrCreateYDoc(filePath);
        const ytext = ydoc.getText("content");
        if (ytext.length === 0) {
          try {
            const content = await invoke<string>("read_note", {
              path: filePath,
            });
            ydoc.transact(() => {
              if (ytext.length === 0) ytext.insert(0, content);
            });
          } catch {
            // File may be unreadable
          }
        }
      } catch {
        // Dialog cancelled or error
      }
    },
    [projectDir],
  );

  const handleOpenDifferent = useCallback(
    (tileId: string) => {
      // SPEC §5.5 — Continue/Cancel confirm if the missing tile has
      // unsaved in-memory edits. Save is not offered (file is gone).
      const tile = useLayoutStore.getState().tiles[tileId];
      const isDirty = useEditorStore.getState().isDirty(tileId);
      const openPicker = () => {
        setSwitcherState({
          pickerMode: "editor",
          targetTileId: tileId,
          targetMode: "editor",
        });
      };
      if (tile?.mode === "missing" && tile.missingPath && isDirty) {
        setPendingDialog({
          kind: "missing-recovery",
          tileId,
          missingPath: tile.missingPath,
          action: "open-different",
          onContinue: openPicker,
        });
        return;
      }
      openPicker();
    },
    [setPendingDialog],
  );

  const handleCloseTile = useCallback(
    (tileId: string) => {
      // SPEC §5.5 — Continue/Cancel confirm on Missing-tile close with
      // unsaved edits. For non-Missing tiles, requestCloseTile uses the
      // regular Save/Discard/Cancel flow.
      const tile = useLayoutStore.getState().tiles[tileId];
      const isDirty = useEditorStore.getState().isDirty(tileId);
      if (tile?.mode === "missing" && tile.missingPath && isDirty) {
        setPendingDialog({
          kind: "missing-recovery",
          tileId,
          missingPath: tile.missingPath,
          action: "close",
          onContinue: () => {
            useLayoutStore.getState().closeTile(tileId);
          },
        });
        return;
      }
      requestCloseTile(tileId);
    },
    [requestCloseTile, setPendingDialog],
  );

  useKeyboardShortcuts({
    onOpenBufferSwitcher: handleOpenBufferSwitcher,
    onOpenFindFile: handleOpenFindFile,
    onModeSwitch: handleModeSwitch,
    onQuit: () => { void requestAppQuit(); },
    onOpenSidebarSearch: () => {
      useLayoutStore.getState().requestSidebarSearchFocus();
    },
  });

  return (
    <div
      data-testid="app-shell"
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--color-bg-primary)",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        {/* Activity sidebar */}
        <ActivitySidebar />

        {/* Tiling layout */}
        <MosaicLayout
          onOpenPicker={handleOpenPicker}
          onLocate={handleLocate}
          onOpenDifferent={handleOpenDifferent}
          onCloseTile={handleCloseTile}
        />
      </div>

      {/* Status bar */}
      {statusMessage && (
        <div
          data-testid="status-bar"
          style={{
            height: "24px",
            padding: "0 12px",
            background: "var(--color-surface-dark)",
            color: "rgba(255,255,255,0.6)",
            fontFamily: "var(--font-prose)",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Buffer switcher overlay */}
      {switcherState && (
        <BufferSwitcher
          pickerMode={switcherState.pickerMode}
          targetTileId={switcherState.targetTileId}
          targetMode={switcherState.targetMode}
          onClose={handleSwitcherClose}
        />
      )}

      {/* Crash recovery dialog */}
      {recoveryPaths.length > 0 && (
        <RecoveryDialog
          recoveries={recoveryPaths}
          onClose={handleCloseRecovery}
        />
      )}

      {/* Unsaved-changes / consolidated-quit dialog (SPEC §4.0.1) */}
      <UnsavedChangesDialog />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App(): React.ReactElement {
  const [projectLoaded, setProjectLoaded] = useState(() => {
    const data = (
      window as Window & { __NOTESAPP_PRELOADED__?: PreloadedData }
    ).__NOTESAPP_PRELOADED__;
    return !!data?.dir;
  });

  useEffect(() => {
    if (projectLoaded) return;
    const id = setInterval(() => {
      const data = (
        window as Window & { __NOTESAPP_PRELOADED__?: PreloadedData }
      ).__NOTESAPP_PRELOADED__;
      if (data?.dir) {
        clearInterval(id);
        setProjectLoaded(true);
      }
    }, 100);
    return () => clearInterval(id);
  }, [projectLoaded]);

  const handleProjectLoaded = useCallback(() => {
    setProjectLoaded(true);
  }, []);

  return (
    <div
      data-testid="app-root"
      style={{ width: "100vw", height: "100vh", overflow: "hidden" }}
    >
      {projectLoaded ? (
        <AppShell />
      ) : (
        <ProjectLoader onProjectLoaded={handleProjectLoaded} />
      )}
    </div>
  );
}
