// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import useLayoutStore, { TileType } from "../stores/layoutStore";
import useEditorStore from "../stores/editorStore";

interface TileBarProps {
  tileId: string;
  type: TileType;
  filePath: string | null;
}

const TYPE_LABELS: Record<TileType, string> = {
  editor: "Editor",
  preview: "Preview",
};

export default function TileBar({
  tileId,
  type,
  filePath,
}: TileBarProps): React.ReactElement {
  const { splitTile, closeTile, toggleMaximize, togglePin, pinnedTileId, mosaicTree } =
    useLayoutStore();
  const isDirty = useEditorStore((s) => s.dirtyStates[tileId] ?? false);

  const isPinned = pinnedTileId === tileId;
  const fileName = filePath
    ? filePath.split("/").pop() ?? filePath
    : "(no file)";

  const leavesCount = mosaicTree
    ? (typeof mosaicTree === "string" ? 1 : countLeaves(mosaicTree))
    : 1;
  const canClose = leavesCount > 1;

  // The drag handle area
  const titleContent = (
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
        gap: "6px",
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
        {isDirty && (
          <span
            data-testid={`dirty-indicator-${tileId}`}
            style={{ color: "var(--color-accent)", marginLeft: "2px" }}
            title="Unsaved changes"
          >
            •
          </span>
        )}
      </span>
      <span
        data-testid={`tile-type-badge-${tileId}`}
        style={{
          fontSize: "10px",
          color: "rgba(255,255,255,0.4)",
          flexShrink: 0,
          padding: "1px 4px",
          background: "rgba(255,255,255,0.08)",
          borderRadius: "3px",
          fontFamily: "var(--font-prose)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {TYPE_LABELS[type]}
      </span>
    </span>
  );

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
      {titleContent}

      {/* Pin icon — editor tiles only */}
      {type === "editor" && (
        <button
          data-testid={`tile-pin-${tileId}`}
          onClick={() => togglePin(tileId)}
          title={isPinned ? "Unpin tile (C-x p)" : "Pin tile (C-x p)"}
          style={btnStyle(isPinned)}
          aria-pressed={isPinned}
          aria-label={isPinned ? "Unpin tile" : "Pin tile"}
        >
          {isPinned ? "📌" : "☆"}
        </button>
      )}

      {/* Split horizontal */}
      <button
        data-testid={`tile-split-h-${tileId}`}
        onClick={() => splitTile(tileId, "row")}
        title="Split pane horizontally (C-x h)"
        style={btnStyle(false)}
        aria-label="Split horizontal"
      >
        ⊟
      </button>

      {/* Split vertical */}
      <button
        data-testid={`tile-split-v-${tileId}`}
        onClick={() => splitTile(tileId, "column")}
        title="Split pane vertically (C-x v)"
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
          onClick={() => closeTile(tileId)}
          title="Close pane (C-x 0)"
          style={{ ...btnStyle(false), color: "rgba(255,80,80,0.8)" }}
          aria-label="Close tile"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function countLeaves(tree: import("react-mosaic-component").MosaicNode<string>): number {
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
