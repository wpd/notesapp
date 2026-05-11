// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import useProjectStore from "../stores/projectStore";
import useLayoutStore from "../stores/layoutStore";

interface ReferenceEntry {
  name: string;
  path: string;
}

interface SidebarReferencesSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function SidebarReferencesSection({
  isOpen,
  onToggle,
}: SidebarReferencesSectionProps): React.ReactElement {
  const [refs, setRefs] = useState<ReferenceEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const projectDir = useProjectStore((s) => s.projectDir);

  const loadRefs = useCallback(() => {
    if (!projectDir) { setRefs([]); return; }
    invoke<ReferenceEntry[]>("list_references", { projectDir })
      .then(setRefs)
      .catch(() => setRefs([]));
  }, [projectDir]);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  // Refresh list on file-change events scoped to references/
  useEffect(() => {
    if (!projectDir) return;
    const unlistenPromise = listen<{ path: string }>("file-change", (event) => {
      if (event.payload.path.includes("/references/")) {
        loadRefs();
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [projectDir, loadRefs]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!projectDir) return;
      const osPath =
        e.dataTransfer.getData("text/plain") ||
        (e.dataTransfer.files[0] as File & { path?: string })?.path ||
        "";
      if (!osPath) return;
      invoke<ReferenceEntry>("import_reference", { projectDir, srcPath: osPath })
        .then(() => loadRefs())
        .catch(() => {});
    },
    [projectDir, loadRefs],
  );

  const handleItemClick = useCallback((ref: ReferenceEntry) => {
    const layout = useLayoutStore.getState();
    const focused = layout.focusedTileId;
    if (!focused) return;
    layout.setTileMode(focused, "reference");
    layout.setTileFile(focused, ref.path);
  }, []);

  return (
    <div data-testid="sidebar-references-section" style={{ flexShrink: 0 }}>
      {/* Section header */}
      <button
        data-testid="sidebar-references-toggle"
        onClick={onToggle}
        style={sectionHeaderStyle}
        aria-expanded={isOpen}
      >
        <span style={{ marginRight: "4px" }}>{isOpen ? "▾" : "▸"}</span>
        References
      </button>

      {isOpen && (
        <div
          data-testid="sidebar-references-list"
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          style={{
            borderBottom: "1px solid var(--color-border)",
            minHeight: "40px",
            background: isDragOver
              ? "var(--color-accent-muted)"
              : "transparent",
            transition: "background 0.1s",
          }}
        >
          {refs.length === 0 ? (
            <div style={hintStyle}>
              {isDragOver
                ? "Drop to import…"
                : "No references. Drag a PDF or markdown file here to import."}
            </div>
          ) : (
            refs.map((ref) => (
              <div
                key={ref.path}
                data-testid={`sidebar-ref-${ref.name}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/notesapp-path", ref.path);
                  e.dataTransfer.setData("text/plain", ref.path);
                }}
                onClick={() => handleItemClick(ref)}
                title={`${ref.name} — drag to open in a tile`}
                style={itemStyle}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(0,0,0,0.05)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "transparent";
                }}
              >
                {ref.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "6px 12px",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--color-border)",
  fontFamily: "var(--font-prose)",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  cursor: "pointer",
  textAlign: "left",
};

const hintStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontFamily: "var(--font-prose)",
  fontSize: "12px",
  color: "var(--color-text-disabled)",
  fontStyle: "italic",
};

const itemStyle: React.CSSProperties = {
  padding: "5px 12px",
  fontFamily: "var(--font-prose)",
  fontSize: "13px",
  color: "var(--color-text-primary)",
  cursor: "default",
  borderRadius: "3px",
  margin: "0 4px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  userSelect: "none",
};
