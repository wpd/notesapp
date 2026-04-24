// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import useLayoutStore, { TileMode } from "../stores/layoutStore";
import useEditorStore from "../stores/editorStore";

interface TileBarProps {
  tileId: string;
  mode: TileMode;
  filePath: string | null;
  missingPath?: string;
  onOpenPicker?: () => void;
}

const MODE_LABELS: Record<TileMode, string> = {
  editor: "Editor",
  preview: "Preview",
  reference: "Reference",
  aichat: "AI Chat",
  missing: "\u26A0 Missing",
};

export default function TileBar({
  tileId,
  mode,
  filePath,
  missingPath,
  onOpenPicker,
}: TileBarProps): React.ReactElement {
  const {
    splitTile,
    requestCloseTile,
    toggleMaximize,
    togglePin,
    pinnedTileId,
    mosaicTree,
    setTileMode,
    setStatusMessage,
    toggleWordWrap,
  } = useLayoutStore();
  const isDirty = useEditorStore((s) => s.dirtyStates[tileId] ?? false);
  const wordWrap = useLayoutStore((s) => s.wordWrap[tileId] ?? true);

  const isPinned = pinnedTileId === tileId;

  const fileName =
    mode === "missing"
      ? missingPath?.split("/").pop() ?? "(missing)"
      : filePath
        ? filePath.split("/").pop() ?? filePath
        : "(no file)";

  const isMarkdown = filePath?.endsWith(".md") ?? false;
  const canToggleMode =
    (mode === "editor" || mode === "preview") && isMarkdown;
  const toggleDisabled =
    (mode === "editor" || mode === "preview") && !isMarkdown;

  const leavesCount = mosaicTree
    ? typeof mosaicTree === "string"
      ? 1
      : countLeaves(mosaicTree)
    : 1;
  const canClose = leavesCount > 1;

  const handleModeToggle = () => {
    if (!canToggleMode) {
      if (toggleDisabled) {
        setStatusMessage("Preview is only available for markdown files");
      }
      return;
    }
    const newMode: TileMode = mode === "editor" ? "preview" : "editor";
    setTileMode(tileId, newMode);
  };

  return (
    <div
      data-testid={`tile-bar-${tileId}`}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 6px",
        height: "30px",
        background: "var(--color-surface-dark)",
        color: "rgba(255,255,255,0.75)",
        fontFamily: "var(--font-prose)",
        fontSize: "12px",
        userSelect: "none",
        gap: "4px",
        flexShrink: 0,
      }}
    >
      {/* Mode indicator — toggle for Editor/Preview, label for others */}
      <button
        data-testid={`tile-mode-indicator-${tileId}`}
        onClick={handleModeToggle}
        disabled={mode === "missing" || mode === "reference" || mode === "aichat"}
        title={
          canToggleMode
            ? `Switch to ${mode === "editor" ? "Preview" : "Editor"}`
            : toggleDisabled
              ? "Preview is only available for .md files"
              : MODE_LABELS[mode]
        }
        style={{
          ...btnStyle(false),
          fontSize: "10px",
          padding: "1px 6px",
          background: "rgba(255,255,255,0.08)",
          borderRadius: "3px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          opacity:
            mode === "missing" || mode === "reference" || mode === "aichat"
              ? 0.5
              : toggleDisabled
                ? 0.3
                : 1,
          cursor:
            canToggleMode
              ? "pointer"
              : "default",
        }}
      >
        {MODE_LABELS[mode]}
      </button>

      {/* Buffer name + dropdown (not shown on Missing tiles) */}
      {mode !== "missing" ? (
        <span
          data-testid={`tile-title-text-${tileId}`}
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            cursor: "move",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            minWidth: 0,
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fileName}
            {isDirty && (mode === "editor" || mode === "preview") && (
              <span
                data-testid={`dirty-indicator-${tileId}`}
                style={{ color: "var(--color-accent)", marginLeft: "2px" }}
                title="Unsaved changes"
              >
                •
              </span>
            )}
          </span>
          {onOpenPicker && (
            <button
              data-testid={`tile-buffer-dropdown-${tileId}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenPicker();
              }}
              title="Switch buffer"
              style={{
                ...btnStyle(false),
                fontSize: "8px",
                padding: "0 2px",
                flexShrink: 0,
              }}
            >
              ▾
            </button>
          )}
        </span>
      ) : (
        <span
          data-testid={`tile-title-text-${tileId}`}
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--color-warning)",
            display: "flex",
            alignItems: "center",
            minWidth: 0,
          }}
        >
          {fileName}
        </span>
      )}

      {/* Word-wrap toggle — editor tiles only */}
      {mode === "editor" && (
        <button
          data-testid={`word-wrap-toggle-${tileId}`}
          onClick={() => toggleWordWrap(tileId)}
          title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          style={btnStyle(wordWrap)}
          aria-pressed={wordWrap}
          aria-label={wordWrap ? "Disable word wrap" : "Enable word wrap"}
        >
          ⏎
        </button>
      )}

      {/* Pin icon — editor tiles only.
          When pinned, the button is additionally tagged with
          data-testid="pinned-indicator-${tileId}" so E2E tests can detect
          pin state without parsing the icon character. */}
      {mode === "editor" && (
        <button
          data-testid={
            isPinned ? `pinned-indicator-${tileId}` : `tile-pin-${tileId}`
          }
          onClick={() => togglePin(tileId)}
          title={isPinned ? "Unpin tile (C-x p)" : "Pin tile (C-x p)"}
          style={btnStyle(isPinned)}
          aria-pressed={isPinned}
          aria-label={isPinned ? "Unpin tile" : "Pin tile"}
        >
          {isPinned ? "\uD83D\uDCCC" : "\u2606"}
        </button>
      )}

      {/* Split horizontal */}
      <button
        data-testid={`tile-split-h-${tileId}`}
        onClick={() => splitTile(tileId, "column")}
        title="Split tile horizontally (C-x h)"
        style={btnStyle(false)}
        aria-label="Split horizontal"
      >
        ⊟
      </button>

      {/* Split vertical */}
      <button
        data-testid={`tile-split-v-${tileId}`}
        onClick={() => splitTile(tileId, "row")}
        title="Split tile vertically (C-x v)"
        style={btnStyle(false)}
        aria-label="Split vertical"
      >
        ⊞
      </button>

      {/* Maximize / restore */}
      <button
        data-testid={`tile-maximize-${tileId}`}
        onClick={() => toggleMaximize(tileId)}
        title="Maximize / restore (C-x z)"
        style={btnStyle(false)}
        aria-label="Maximize"
      >
        □
      </button>

      {/* Close */}
      {canClose && (
        <button
          data-testid={`tile-close-${tileId}`}
          onClick={() => requestCloseTile(tileId)}
          title="Close tile (C-x 0)"
          style={{ ...btnStyle(false), color: "rgba(255,80,80,0.8)" }}
          aria-label="Close tile"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function countLeaves(
  tree: import("react-mosaic-component").MosaicNode<string>,
): number {
  if (typeof tree === "string") return 1;
  return countLeaves(tree.first) + countLeaves(tree.second);
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(204,120,92,0.3)" : "transparent",
    border: "none",
    color: active ? "var(--color-accent)" : "rgba(255,255,255,0.6)",
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: "3px",
    fontSize: "12px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  };
}
