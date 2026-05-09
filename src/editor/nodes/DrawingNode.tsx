// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * DrawingBlock Tiptap extension — embeds Excalidraw drawings.
 *
 * Read-only by default; double-click to enter edit mode.
 * Escape or click-outside exits edit mode and saves the sidecar.
 * Sidecar path: <note-dir>/<stem>.NNNN.drawing  (stored in node.attrs.filename)
 *
 * Full path is resolved using editor.storage.drawingBlock.noteDirectory,
 * which WysiwygPane sets after the editor mounts.
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { invoke } from "@tauri-apps/api/core";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })),
);

interface ExcalidrawData {
  type: string;
  version: number;
  source: string;
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

const EMPTY_DRAWING: ExcalidrawData = {
  type: "excalidraw",
  version: 2,
  source: "notesapp",
  elements: [],
  appState: {},
  files: {},
};

export function DrawingNodeView({ node, editor }: NodeViewProps) {
  const filename = node.attrs.filename as string;
  const noteDir: string = (editor.storage as unknown as Record<string, Record<string, string>>).drawingBlock?.noteDirectory ?? "";
  const sidecarPath = noteDir && filename ? `${noteDir}/${filename}` : "";

  const [editMode, setEditMode] = useState(false);
  const [data, setData] = useState<ExcalidrawData>(EMPTY_DRAWING);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingData = useRef<ExcalidrawData | null>(null);

  // Load sidecar on mount
  useEffect(() => {
    if (!sidecarPath) return;
    invoke<string>("read_drawing", { path: sidecarPath })
      .then((raw) => {
        const parsed = JSON.parse(raw) as ExcalidrawData;
        setData(parsed);
      })
      .catch(() => {
        setData(EMPTY_DRAWING);
      })
      .finally(() => setLoaded(true));
  }, [sidecarPath]);

  const saveSidecar = useCallback(
    (d: ExcalidrawData) => {
      if (!sidecarPath) return;
      const raw = JSON.stringify(d);
      void invoke("write_drawing", { path: sidecarPath, content: raw }).catch(
        () => {},
      );
      void invoke("delete_drawing_tmp", { path: sidecarPath }).catch(() => {});
    },
    [sidecarPath],
  );

  const exitEdit = useCallback(() => {
    setEditMode(false);
    if (pendingData.current) {
      saveSidecar(pendingData.current);
    }
  }, [saveSidecar]);

  // Escape key exits edit mode
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        exitEdit();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [editMode, exitEdit]);

  // Click-outside exits edit mode
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as globalThis.Node)) {
        exitEdit();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editMode, exitEdit]);

  const handleChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      const next: ExcalidrawData = {
        type: "excalidraw",
        version: 2,
        source: "notesapp",
        elements: elements as ExcalidrawElement[],
        appState,
        files,
      };
      pendingData.current = next;
      setData(next);

      if (!sidecarPath) return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        void invoke("autosave_drawing", {
          path: sidecarPath,
          content: JSON.stringify(next),
        }).catch(() => {});
      }, 30_000);
    },
    [sidecarPath],
  );

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  return (
    <NodeViewWrapper contentEditable={false} data-testid="drawing-block" data-filename={filename}>
      <div
        ref={containerRef}
        onDoubleClick={() => !editMode && setEditMode(true)}
        style={{
          border: editMode
            ? "2px solid var(--color-accent-muted, rgba(0,120,255,0.4))"
            : "1px solid var(--color-border, #ccc)",
          borderRadius: "6px",
          overflow: "hidden",
          margin: "1em 0",
          height: editMode ? "480px" : "280px",
          background: "var(--color-bg-primary)",
          cursor: editMode ? "default" : "pointer",
          position: "relative",
        }}
      >
        {!loaded && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--color-text-disabled)",
            }}
          >
            Loading drawing…
          </div>
        )}
        {loaded && (
          <Suspense fallback={<div style={{ padding: "1rem" }}>Loading Excalidraw…</div>}>
            <Excalidraw
              initialData={{
                elements: data.elements,
                appState: { ...data.appState, collaborators: new Map() },
                files: data.files,
              }}
              viewModeEnabled={!editMode}
              onChange={editMode ? handleChange : undefined}
              UIOptions={{
                canvasActions: { export: false, loadScene: false, saveAsImage: false },
              }}
            />
          </Suspense>
        )}
        {!editMode && (
          <div
            style={{
              position: "absolute",
              bottom: "6px",
              right: "8px",
              fontSize: "11px",
              color: "var(--color-text-disabled)",
              pointerEvents: "none",
            }}
          >
            {filename || "drawing"} · double-click to edit
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const DrawingBlock = Node.create({
  name: "drawingBlock",
  group: "block",
  atom: true,

  addStorage() {
    return { noteDirectory: "" };
  },

  addAttributes() {
    return {
      filename: {
        default: "",
        parseHTML: (element: Element) =>
          element.getAttribute("data-filename") ?? "",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.filename ? { "data-filename": attrs.filename as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="drawing"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "drawing", ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingNodeView);
  },
});
