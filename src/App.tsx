// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import useProjectStore from "./stores/projectStore";
import useLayoutStore from "./stores/layoutStore";
import MosaicLayout from "./components/MosaicLayout";
import ActivitySidebar from "./components/ActivitySidebar";
import BufferSwitcher from "./components/BufferSwitcher";
import RecoveryDialog from "./components/RecoveryDialog";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

// ---------------------------------------------------------------------------
// Project loading screen
// ---------------------------------------------------------------------------

function ProjectLoader({
  onProjectLoaded,
}: {
  onProjectLoaded: () => void;
}): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setProjectDir } = useProjectStore();

  useEffect(() => {
    async function tryAutoLoad() {
      try {
        // Check NOTESAPP_PROJECT_DIR env var
        const envDir = await invoke<string | null>("get_project_dir_env");
        if (envDir) {
          await setProjectDir(envDir);
          onProjectLoaded();
          return;
        }
      } catch {
        // Fall through to dialog
      }
      setLoading(false);
    }
    void tryAutoLoad();
  }, [setProjectDir, onProjectLoaded]);

  const handleChooseDir = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (!selected) {
        setLoading(false);
        return;
      }
      const dir = typeof selected === "string" ? selected : selected[0];
      await setProjectDir(dir);
      onProjectLoaded();
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

type SwitcherMode = "buffer" | "find-file";

function AppShell(): React.ReactElement {
  const [switcherMode, setSwitcherMode] = useState<SwitcherMode | null>(null);
  const [recoveryPaths, setRecoveryPaths] = useState<string[]>([]);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const projectDir = useProjectStore((s) => s.projectDir);
  const { initDefaultLayout, loadLayout } = useLayoutStore();

  // Hydrate Zustand from window.__NOTESAPP_PRELOADED__ if it hasn't been set
  // yet (automation / dev path where NOTESAPP_PROJECT_DIR env var is present).
  // This effect runs after AppShell is first committed — the ONLY safe site to
  // call useProjectStore.setState(): no concurrent render is in progress, and
  // the React fiber tree is fully healthy (not stale / partially detached).
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
  }, []); // intentionally empty — run once on mount only

  // Load persisted layout or fall back to default.
  // A 3-second timeout guards against invoke() hanging under WebKit
  // automation (where IPC may not resolve after the automation DOM reset).
  // When projectDir is null (Zustand hydration pending), use default layout
  // immediately so tiles are visible.
  useEffect(() => {
    let active = true;
    async function load() {
      if (!projectDir) {
        // No project dir yet — use default layout so tiles appear.
        initDefaultLayout();
        return;
      }
      let restored = false;
      try {
        restored = await Promise.race([
          loadLayout(projectDir),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
        ]);
      } catch {
        restored = false;
      }
      if (active && !restored) {
        initDefaultLayout();
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [projectDir, loadLayout, initDefaultLayout]);

  // Crash-recovery scan: when the project loads, check for `.tmp` autosave
  // files alongside `.md` notes.  If found, surface a RecoveryDialog so the
  // user can recover or discard drafts from a previous session.
  useEffect(() => {
    if (!projectDir || recoveryDismissed) return;
    let active = true;
    invoke<string[]>("find_recovery_files", { projectDir })
      .then((paths) => {
        if (active && paths && paths.length > 0) {
          setRecoveryPaths(paths);
        }
      })
      .catch(() => {
        // Non-fatal — recovery is best-effort.
      });
    return () => {
      active = false;
    };
  }, [projectDir, recoveryDismissed]);

  const handleCloseRecovery = useCallback(() => {
    setRecoveryPaths([]);
    setRecoveryDismissed(true);
  }, []);

  const handleOpenBufferSwitcher = useCallback(() => {
    setSwitcherMode("buffer");
  }, []);

  const handleOpenFindFile = useCallback(() => {
    setSwitcherMode("find-file");
  }, []);

  useKeyboardShortcuts({
    onOpenBufferSwitcher: handleOpenBufferSwitcher,
    onOpenFindFile: handleOpenFindFile,
  });

  return (
    <div
      data-testid="app-shell"
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
        background: "var(--color-bg-primary)",
      }}
    >
      {/* Activity sidebar */}
      <ActivitySidebar />

      {/* Tiling layout */}
      <MosaicLayout />

      {/* Buffer switcher / find-file overlay */}
      {switcherMode && (
        <BufferSwitcher
          mode={switcherMode}
          onClose={() => setSwitcherMode(null)}
        />
      )}

      {/* Crash recovery dialog — shown once on project load if .tmp files exist */}
      {recoveryPaths.length > 0 && (
        <RecoveryDialog
          recoveries={recoveryPaths}
          onClose={handleCloseRecovery}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App(): React.ReactElement {
  // Lazy initializer: check window.__NOTESAPP_PRELOADED__ synchronously so
  // that when main.tsx creates a fresh React root after the WebKit automation
  // DOM reset, App skips the ProjectLoader entirely and renders AppShell
  // directly.  Rust sets __NOTESAPP_PRELOADED__ in on_page_load(Finished)
  // before the DOM reset fires, so the data is always available here in the
  // automation path.
  const [projectLoaded, setProjectLoaded] = useState(() => {
    const data = (
      window as Window & { __NOTESAPP_PRELOADED__?: PreloadedData }
    ).__NOTESAPP_PRELOADED__;
    return !!data?.dir;
  });

  // Fallback poller for the normal launch path where on_page_load fires after
  // the initial flushSync render (NOTESAPP_PROJECT_DIR is set but the preloaded
  // data arrives slightly later than the first render).
  //
  // IMPORTANT — only call React's own setState here, never
  // useProjectStore.setState().  Zustand is hydrated safely from AppShell's
  // useEffect after the render is committed.
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

  // Manual project open path: ProjectLoader calls this after setProjectDir
  // succeeds (which already sets Zustand isLoaded=true).
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
