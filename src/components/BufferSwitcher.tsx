// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useState, useEffect, useRef, useCallback } from "react";
import useProjectStore, { NoteEntry } from "../stores/projectStore";
import useLayoutStore, { TileMode } from "../stores/layoutStore";
import useEditorStore from "../stores/editorStore";
import { invoke } from "@tauri-apps/api/core";

export type PickerMode =
  | "editor" // Editor buffer picker: all text files + New note
  | "preview" // Preview buffer picker: .md only + New note
  | "find-file" // C-x C-f: same as editor picker but with Create option
  | "reference" // Reference buffer picker: files from references/ dir, no New row
  | "aichat-stub"; // Phase 1 stub for AI Chat mode

interface BufferSwitcherProps {
  onClose: () => void;
  pickerMode?: PickerMode;
  /** When set, the switcher binds to this tile and mode-switches on select */
  targetTileId?: string;
  targetMode?: TileMode;
  /** Called after a successful selection */
  onSelect?: (filePath: string) => void;
}

export default function BufferSwitcher({
  onClose,
  pickerMode = "editor",
  targetTileId,
  targetMode,
  onSelect,
}: BufferSwitcherProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [allNotes, setAllNotes] = useState<NoteEntry[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { notes, refreshNotes } = useProjectStore();
  const { focusedTileId, requestSetTileFile, persistLayout } =
    useLayoutStore();
  const { getOrCreateYDoc } = useEditorStore();
  const projectDir = useProjectStore((s) => s.projectDir);

  const effectiveTileId = targetTileId ?? focusedTileId;

  const isStub = pickerMode === "aichat-stub";
  const isReference = pickerMode === "reference";

  // Load notes/references list based on picker mode
  useEffect(() => {
    if (!projectDir) return;
    if (isReference) {
      invoke<NoteEntry[]>("list_references", { projectDir })
        .then(setAllNotes)
        .catch(() => setAllNotes([]));
      return;
    }
    const cmd =
      pickerMode === "preview" ? "list_notes" : "list_notes_all";
    invoke<NoteEntry[]>(cmd, { path: projectDir })
      .then(setAllNotes)
      .catch(() => setAllNotes(notes));
  }, [projectDir, pickerMode, isReference, notes]);

  // Filter notes by query
  const filtered: NoteEntry[] = query.trim()
    ? allNotes.filter((n) =>
        n.name.toLowerCase().includes(query.toLowerCase()),
      )
    : allNotes;

  // Determine if we can offer a "Create new note" option
  const trimmedQuery = query.trim();
  const hasExactMatch =
    trimmedQuery.length > 0 &&
    allNotes.some(
      (n) => n.name.toLowerCase() === trimmedQuery.toLowerCase(),
    );
  // Reference picker never shows create/new rows — references are imported, not created
  const showCreateOption =
    !isReference && trimmedQuery.length > 0 && !hasExactMatch && !!projectDir;
  // Always show "+ New note…" as the first item when query is empty
  const showNewNoteTop =
    !isReference && trimmedQuery.length === 0 && !!projectDir;
  const rowCount =
    filtered.length +
    (showCreateOption ? 1 : 0) +
    (showNewNoteTop ? 1 : 0);

  useEffect(() => {
    setSelectedIdx(0);
    setValidationError(null);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const openSelected = useCallback(
    async (note: NoteEntry) => {
      if (!effectiveTileId) {
        onClose();
        return;
      }

      // Reference files are read by ReferencePane directly — skip Y.Doc loading
      if (!isReference) {
        // Load file into Y.Doc if not already loaded
        const ydoc = getOrCreateYDoc(note.path);
        const ytext = ydoc.getText("content");
        if (ytext.length === 0) {
          try {
            const content = await invoke<string>("read_note", {
              path: note.path,
            });
            ydoc.transact(() => {
              if (ytext.length === 0) {
                ytext.insert(0, content);
              }
            });
          } catch {
            // New or unreadable file — open blank
          }
        }
      }

      // SPEC.md §4.0.1 — prompt Save/Discard/Cancel if this would release
      // the last tile of a modified buffer.
      const applied = requestSetTileFile(
        effectiveTileId,
        note.path,
        targetMode,
      );
      if (!applied) {
        // The store opened a dialog; dismiss this picker. The user's
        // eventual Save/Discard choice will complete the binding.
        onClose();
        return;
      }
      if (projectDir) {
        await persistLayout(projectDir);
      }
      onSelect?.(note.path);
      onClose();
    },
    [
      effectiveTileId,
      isReference,
      targetMode,
      requestSetTileFile,
      persistLayout,
      projectDir,
      getOrCreateYDoc,
      onSelect,
      onClose,
    ],
  );

  const createAndOpen = useCallback(
    async (name: string): Promise<void> => {
      if (!projectDir || !effectiveTileId) {
        onClose();
        return;
      }

      // Preview picker validation: reject non-.md extensions
      if (pickerMode === "preview" && name.includes(".") && !name.endsWith(".md")) {
        setValidationError(
          "Preview mode requires a markdown file; please use a .md extension or create this file from an Editor tile instead.",
        );
        return;
      }

      try {
        const newPath = await invoke<string>("create_note", {
          projectDir,
          name,
        });
        await refreshNotes();
        const ydoc = getOrCreateYDoc(newPath);
        ydoc.getText("content");
        const applied = requestSetTileFile(
          effectiveTileId,
          newPath,
          targetMode,
        );
        if (!applied) {
          // Dialog opened — let user resolve the old buffer's fate first.
          onClose();
          return;
        }
        await persistLayout(projectDir);
        onSelect?.(newPath);
      } catch {
        // Swallow
      } finally {
        onClose();
      }
    },
    [
      projectDir,
      effectiveTileId,
      pickerMode,
      targetMode,
      requestSetTileFile,
      persistLayout,
      refreshNotes,
      getOrCreateYDoc,
      onSelect,
      onClose,
    ],
  );

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
      const offset = showNewNoteTop ? 1 : 0;
      if (showNewNoteTop && selectedIdx === 0) {
        // Prompt for filename is handled by createAndOpen
        void createAndOpen(trimmedQuery || "untitled");
      } else if (selectedIdx - offset < filtered.length) {
        void openSelected(filtered[selectedIdx - offset]);
      } else if (showCreateOption) {
        void createAndOpen(trimmedQuery);
      }
    }
  };

  // Phase 1 stub for AI Chat — rendered after all hooks
  if (isStub) {
    const label = "AI Chat";
    return (
      <div
        data-testid="buffer-switcher-overlay"
        onClick={onClose}
        style={overlayStyle}
      >
        <div
          data-testid="buffer-switcher-stub"
          onClick={(e) => e.stopPropagation()}
          style={dialogStyle}
        >
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p
              style={{
                fontSize: "15px",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-prose)",
                marginBottom: "1rem",
              }}
            >
              {label} mode is not yet available.
            </p>
            <p
              style={{
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                fontFamily: "var(--font-prose)",
              }}
            >
              This feature will be implemented in a future phase.
            </p>
            <button
              onClick={onClose}
              style={{
                marginTop: "1rem",
                padding: "6px 16px",
                background: "var(--color-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontFamily: "var(--font-prose)",
                fontSize: "13px",
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  const placeholderText =
    pickerMode === "preview"
      ? "Open markdown note…"
      : pickerMode === "reference"
        ? "Open reference document…"
        : "Open note…";

  return (
    <div
      data-testid="buffer-switcher-overlay"
      onClick={onClose}
      style={overlayStyle}
    >
      <div
        data-testid="buffer-switcher"
        role="dialog"
        aria-modal="true"
        aria-label="Buffer switcher"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
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
            {pickerMode === "preview" ? "\uD83D\uDC41" : "\uD83D\uDD0D"}
          </span>
          <input
            ref={inputRef}
            data-testid="buffer-switcher-input"
            type="text"
            placeholder={placeholderText}
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

        {/* Validation error */}
        {validationError && (
          <div
            data-testid="buffer-switcher-validation-error"
            style={{
              padding: "8px 14px",
              background: "rgba(220,38,38,0.08)",
              color: "var(--color-error)",
              fontSize: "12px",
              fontFamily: "var(--font-prose)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            {validationError}
          </div>
        )}

        {/* Note list */}
        <div
          data-testid="buffer-switcher-list"
          style={{
            overflow: "auto",
            flex: 1,
          }}
        >
          {filtered.length === 0 && !showCreateOption && !showNewNoteTop ? (
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
              {allNotes.length === 0
                ? "No notes in project"
                : "No matching notes"}
            </div>
          ) : (
            <>
              {/* "+ New note…" at top when no query */}
              {showNewNoteTop && (
                <div
                  data-testid="buffer-new-note-top"
                  onClick={() => void createAndOpen("untitled")}
                  style={itemStyle(selectedIdx === 0)}
                  onMouseEnter={() => setSelectedIdx(0)}
                >
                  + New note…
                </div>
              )}

              {filtered.map((note, idx) => {
                const adjustedIdx = idx + (showNewNoteTop ? 1 : 0);
                return (
                  <div
                    key={note.path}
                    data-testid={`buffer-item-${note.name}`}
                    onClick={() => void openSelected(note)}
                    style={itemStyle(adjustedIdx === selectedIdx)}
                    onMouseEnter={() => setSelectedIdx(adjustedIdx)}
                  >
                    <span>{note.name}</span>
                    {note.extension && note.extension !== "md" && (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--color-text-disabled)",
                          marginLeft: "6px",
                        }}
                      >
                        .{note.extension}
                      </span>
                    )}
                  </div>
                );
              })}

              {showCreateOption && (
                <div
                  data-testid="buffer-create-new"
                  onClick={() => void createAndOpen(trimmedQuery)}
                  style={{
                    ...itemStyle(
                      selectedIdx ===
                        filtered.length + (showNewNoteTop ? 1 : 0),
                    ),
                    borderTop: "1px solid var(--color-border)",
                    color:
                      selectedIdx ===
                      filtered.length + (showNewNoteTop ? 1 : 0)
                        ? "var(--color-text-primary)"
                        : "var(--color-accent)",
                  }}
                  onMouseEnter={() =>
                    setSelectedIdx(
                      filtered.length + (showNewNoteTop ? 1 : 0),
                    )
                  }
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

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 1000,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "15vh",
};

const dialogStyle: React.CSSProperties = {
  background: "var(--color-bg-overlay)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  width: "500px",
  maxHeight: "60vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
};

function itemStyle(selected: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    fontFamily: "var(--font-prose)",
    fontSize: "13px",
    color: selected
      ? "var(--color-text-primary)"
      : "var(--color-text-secondary)",
    background: selected ? "var(--color-accent-muted)" : "transparent",
    cursor: "pointer",
    borderLeft: selected
      ? "3px solid var(--color-accent)"
      : "3px solid transparent",
    display: "flex",
    alignItems: "center",
  };
}
