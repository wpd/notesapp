// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import useProjectStore from "../stores/projectStore";
import useLayoutStore from "../stores/layoutStore";
import SidebarSearchSection from "./SidebarSearchSection";
import SidebarReferencesSection from "./SidebarReferencesSection";

export default function ActivitySidebar(): React.ReactElement {
  const { notes } = useProjectStore();
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const sidebarSections = useLayoutStore((s) => s.sidebarSections);
  const setSidebarSection = useLayoutStore((s) => s.setSidebarSection);

  if (!sidebarVisible) {
    return <></>;
  }

  const toggleSection = (key: keyof typeof sidebarSections) => {
    setSidebarSection(key, !sidebarSections[key]);
  };

  return (
    <div
      data-testid="activity-sidebar"
      style={{
        width: "220px",
        flexShrink: 0,
        background: "var(--color-bg-secondary)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
      }}
    >
      {/* ── Explorer section ───────────────────────────────────────── */}
      <button
        data-testid="sidebar-explorer-toggle"
        onClick={() => toggleSection("explorer")}
        style={sectionHeaderStyle}
        aria-expanded={sidebarSections.explorer}
      >
        <span style={{ marginRight: "4px" }}>
          {sidebarSections.explorer ? "▾" : "▸"}
        </span>
        Explorer
      </button>

      {sidebarSections.explorer && (
        <div
          data-testid="explorer-file-list"
          style={{
            overflowY: "auto",
            padding: "4px 0",
            borderBottom: "1px solid var(--color-border)",
            flex: "0 1 auto",
            maxHeight: "40vh",
          }}
        >
          {notes.length === 0 ? (
            <div
              style={{
                padding: "12px",
                color: "var(--color-text-disabled)",
                fontFamily: "var(--font-prose)",
                fontSize: "12px",
                fontStyle: "italic",
              }}
            >
              No notes yet.
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.path}
                data-testid={`sidebar-file-${note.name}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/notesapp-path", note.path);
                  e.dataTransfer.setData("text/plain", note.path);
                }}
                title={`${note.name}.md — drag to open in a tile`}
                style={{
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
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(0,0,0,0.05)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "transparent";
                }}
              >
                {note.name}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Search section ─────────────────────────────────────────── */}
      <SidebarSearchSection
        isOpen={sidebarSections.search}
        onToggle={() => toggleSection("search")}
      />

      {/* ── References section ─────────────────────────────────────── */}
      <SidebarReferencesSection
        isOpen={sidebarSections.references}
        onToggle={() => toggleSection("references")}
      />

      {/* Filler to push sections to top */}
      <div style={{ flex: 1 }} />
    </div>
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "8px 12px",
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
  flexShrink: 0,
};
