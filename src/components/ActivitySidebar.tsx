// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import useProjectStore from "../stores/projectStore";
import useLayoutStore from "../stores/layoutStore";

export default function ActivitySidebar(): React.ReactElement {
  const { notes } = useProjectStore();
  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);

  if (!sidebarVisible) {
    return <></>;
  }

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
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          fontFamily: "var(--font-prose)",
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        Explorer
      </div>

      {/* File list */}
      <div
        data-testid="explorer-file-list"
        style={{
          flex: 1,
          overflow: "auto",
          padding: "4px 0",
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
    </div>
  );
}
