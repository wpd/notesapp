// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useState, useEffect, useRef } from "react";
import useProjectStore, { NoteEntry } from "../stores/projectStore";
import useLayoutStore from "../stores/layoutStore";
import useEditorStore from "../stores/editorStore";
import { invoke } from "@tauri-apps/api/core";

interface BufferSwitcherProps {
  onClose: () => void;
  /**
   * "buffer" (C-x b): switch to an existing note only.
   * "find-file" (C-x C-f): same list, but if the query has no exact match
   * and the project has a directory, offer a "Create: <query>" row that
   * creates a new note via the create_note command.
   */
  mode?: "buffer" | "find-file";
}

export default function BufferSwitcher({
  onClose,
  mode = "buffer",
}: BufferSwitcherProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { notes, refreshNotes } = useProjectStore();
  const { focusedTileId, tiles, setTileFile, persistLayout } = useLayoutStore();
  const { getOrCreateYDoc } = useEditorStore();
  const projectDir = useProjectStore((s) => s.projectDir);

  // Filter notes by query
  const filtered: NoteEntry[] = query.trim()
    ? notes.filter((n) =>
        n.name.toLowerCase().includes(query.toLowerCase()),
      )
    : notes;

  // find-file: offer to create a new note when the query has no exact match.
  const trimmedQuery = query.trim();
  const hasExactMatch =
    trimmedQuery.length > 0 &&
    notes.some(
      (n) => n.name.toLowerCase() === trimmedQuery.toLowerCase(),
    );
  const showCreateOption =
    mode === "find-file" &&
    trimmedQuery.length > 0 &&
    !hasExactMatch &&
    !!projectDir;
  // Total rows (filtered notes + optional "Create" sentinel at end)
  const rowCount = filtered.length + (showCreateOption ? 1 : 0);

  // Keep selection in bounds
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const openSelected = async (note: NoteEntry) => {
    if (!focusedTileId) {
      onClose();
      return;
    }
    const tile = tiles[focusedTileId];
    if (!tile || tile.type !== "editor") {
      onClose();
      return;
    }

    // Load file into Y.Doc if not already loaded
    const ydoc = getOrCreateYDoc(note.path);
    const ytext = ydoc.getText("content");
    if (ytext.length === 0) {
      try {
        const content = await invoke<string>("read_note", { path: note.path });
        ydoc.transact(() => {
          if (ytext.length === 0) {
            ytext.insert(0, content);
          }
        });
      } catch {
        // New or unreadable file — open blank
      }
    }

    setTileFile(focusedTileId, note.path);
    if (projectDir) {
      await persistLayout(projectDir);
    }
    onClose();
  };

  const createAndOpen = async (name: string): Promise<void> => {
    if (!projectDir || !focusedTileId) {
      onClose();
      return;
    }
    const tile = tiles[focusedTileId];
    if (!tile || tile.type !== "editor") {
      onClose();
      return;
    }
    try {
      const newPath = await invoke<string>("create_note", {
        projectDir,
        name,
      });
      await refreshNotes();
      // Prime the Y.Doc with empty content, then point the tile at the new file.
      const ydoc = getOrCreateYDoc(newPath);
      ydoc.getText("content"); // no insert — file is empty on disk
      setTileFile(focusedTileId, newPath);
      await persistLayout(projectDir);
    } catch {
      // Swallow — dialog will just close.  A future ticket can surface an error toast.
    } finally {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, rowCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx < filtered.length) {
        openSelected(filtered[selectedIdx]);
      } else if (showCreateOption) {
        void createAndOpen(trimmedQuery);
      }
    }
  };

  return (
    <div
      data-testid="buffer-switcher-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
    >
      <div
        data-testid="buffer-switcher"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-overlay)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          width: "500px",
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              color: "var(--color-text-disabled)",
              fontSize: "14px",
            }}
          >
            🔍
          </span>
          <input
            ref={inputRef}
            data-testid="buffer-switcher-input"
            type="text"
            placeholder="Open note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "var(--font-prose)",
              fontSize: "15px",
              color: "var(--color-text-primary)",
            }}
          />
          <kbd
            style={{
              fontSize: "11px",
              color: "var(--color-text-disabled)",
              background: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: "3px",
              padding: "1px 5px",
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Note list */}
        <div
          data-testid="buffer-switcher-list"
          style={{
            overflow: "auto",
            flex: 1,
          }}
        >
          {filtered.length === 0 && !showCreateOption ? (
            <div
              style={{
                padding: "12px",
                color: "var(--color-text-disabled)",
                fontFamily: "var(--font-prose)",
                fontSize: "13px",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              {notes.length === 0
                ? "No notes in project"
                : "No matching notes"}
            </div>
          ) : (
            <>
              {filtered.map((note, idx) => (
                <div
                  key={note.path}
                  data-testid={`buffer-item-${note.name}`}
                  onClick={() => openSelected(note)}
                  style={{
                    padding: "7px 14px",
                    fontFamily: "var(--font-prose)",
                    fontSize: "13px",
                    color:
                      idx === selectedIdx
                        ? "var(--color-text-primary)"
                        : "var(--color-text-secondary)",
                    background:
                      idx === selectedIdx
                        ? "var(--color-accent-muted)"
                        : "transparent",
                    cursor: "pointer",
                    borderLeft:
                      idx === selectedIdx
                        ? "3px solid var(--color-accent)"
                        : "3px solid transparent",
                  }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  {note.name}
                </div>
              ))}
              {showCreateOption && (
                <div
                  data-testid="buffer-create-new"
                  onClick={() => void createAndOpen(trimmedQuery)}
                  style={{
                    padding: "7px 14px",
                    fontFamily: "var(--font-prose)",
                    fontSize: "13px",
                    color:
                      selectedIdx === filtered.length
                        ? "var(--color-text-primary)"
                        : "var(--color-accent)",
                    background:
                      selectedIdx === filtered.length
                        ? "var(--color-accent-muted)"
                        : "transparent",
                    cursor: "pointer",
                    borderLeft:
                      selectedIdx === filtered.length
                        ? "3px solid var(--color-accent)"
                        : "3px solid transparent",
                    borderTop: "1px solid var(--color-border)",
                  }}
                  onMouseEnter={() => setSelectedIdx(filtered.length)}
                >
                  + Create new note: <strong>{trimmedQuery}</strong>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
