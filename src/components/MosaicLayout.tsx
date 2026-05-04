// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useCallback } from "react";
import { Mosaic, MosaicWindow, MosaicNode } from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";

import useLayoutStore from "../stores/layoutStore";
import TileBar from "./TileBar";
import EditorPane from "./EditorPane";
import WysiwygPane from "./WysiwygPane";
import MissingTile from "./MissingTile";
import { ErrorBoundary } from "./ErrorBoundary";

interface TileContentProps {
  tileId: string;
  onLocate: (tileId: string) => void;
  onOpenDifferent: (tileId: string) => void;
  onCloseTile: (tileId: string) => void;
}

function TileContent({
  tileId,
  onLocate,
  onOpenDifferent,
  onCloseTile,
}: TileContentProps): React.ReactElement {
  const tile = useLayoutStore((s) => s.tiles[tileId]);

  if (!tile) {
    return (
      <div
        data-testid={`tile-missing-${tileId}`}
        style={{
          padding: "1rem",
          color: "var(--color-text-disabled)",
          fontFamily: "var(--font-prose)",
        }}
      >
        ⚠ Tile data not found
      </div>
    );
  }

  switch (tile.mode) {
    case "editor":
      return <EditorPane tileId={tileId} filePath={tile.filePath} />;
    case "preview":
      return <WysiwygPane tileId={tileId} filePath={tile.filePath} />;
    case "missing":
      return (
        <MissingTile
          tileId={tileId}
          missingPath={tile.missingPath ?? tile.filePath ?? "(unknown)"}
          onLocate={() => onLocate(tileId)}
          onOpenDifferent={() => onOpenDifferent(tileId)}
          onClose={() => onCloseTile(tileId)}
        />
      );
    case "reference":
    case "aichat":
      return (
        <div
          data-testid={`tile-stub-${tileId}`}
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-bg-primary)",
            color: "var(--color-text-disabled)",
            fontFamily: "var(--font-prose)",
          }}
        >
          {tile.mode === "reference" ? "Reference" : "AI Chat"} tile
          — coming in a future phase.
        </div>
      );
    default:
      return <div>Unknown tile mode</div>;
  }
}

interface MosaicLayoutProps {
  onOpenPicker: (tileId: string) => void;
  onLocate: (tileId: string) => void;
  onOpenDifferent: (tileId: string) => void;
  onCloseTile: (tileId: string) => void;
}

export default function MosaicLayout({
  onOpenPicker,
  onLocate,
  onOpenDifferent,
  onCloseTile,
}: MosaicLayoutProps): React.ReactElement {
  const { mosaicTree, tiles, setMosaicTree, focusTile, setTileFile, setTileMode } =
    useLayoutStore();

  const handleChange = useCallback(
    (newTree: MosaicNode<string> | null) => {
      setMosaicTree(newTree);
    },
    [setMosaicTree],
  );

  if (!mosaicTree) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-primary)",
          color: "var(--color-text-disabled)",
          fontFamily: "var(--font-prose)",
        }}
      >
        No tiles open.
      </div>
    );
  }

  return (
    <div
      data-testid="mosaic-layout"
      style={{
        flex: 1,
        overflow: "hidden",
        height: "100%",
      }}
      className="mosaic-blueprint-theme notesapp-mosaic"
    >
      <Mosaic<string>
        value={mosaicTree}
        onChange={handleChange}
        renderTile={(id, path) => {
          const tile = tiles[id];

          return (
            <MosaicWindow<string>
              key={id}
              path={path}
              title={tile?.filePath?.split("/").pop() ?? "(no file)"}
              renderToolbar={() => (
                <div style={{ width: "100%" }}>
                  <TileBar
                    tileId={id}
                    mode={tile?.mode ?? "editor"}
                    filePath={tile?.filePath ?? null}
                    missingPath={tile?.missingPath}
                    onOpenPicker={
                      tile?.mode !== "missing"
                        ? () => onOpenPicker(id)
                        : undefined
                    }
                  />
                </div>
              )}
            >
              <div
                data-testid={`tile-${id}`}
                data-tile-mode={tile?.mode ?? "editor"}
                onClick={() => focusTile(id)}
                onFocus={() => focusTile(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const notePath =
                    e.dataTransfer.getData("text/notesapp-path");
                  if (notePath && tile) {
                    e.preventDefault();
                    const isMarkdown = notePath.endsWith(".md");
                    // If tile is preview and file is not .md, switch to editor
                    if (tile.mode === "preview" && !isMarkdown) {
                      setTileMode(id, "editor");
                    }
                    setTileFile(id, notePath);
                    // Load the file into Y.Doc
                    import("../stores/editorStore")
                      .then(({ default: editorStore }) => {
                        const ydoc = editorStore
                          .getState()
                          .getOrCreateYDoc(notePath);
                        const ytext = ydoc.getText("content");
                        if (ytext.length === 0) {
                          import("@tauri-apps/api/core").then(
                            ({ invoke }) => {
                              invoke<string>("read_note", {
                                path: notePath,
                              })
                                .then((content) => {
                                  ydoc.transact(() => {
                                    if (ytext.length === 0)
                                      ytext.insert(0, content);
                                  });
                                })
                                .catch(() => {});
                            },
                          );
                        }
                      })
                      .catch(() => {});
                  }
                }}
                style={{ height: "100%", overflow: "hidden" }}
              >
                <ErrorBoundary tileId={id}>
                  <TileContent
                    tileId={id}
                    onLocate={onLocate}
                    onOpenDifferent={onOpenDifferent}
                    onCloseTile={onCloseTile}
                  />
                </ErrorBoundary>
              </div>
            </MosaicWindow>
          );
        }}
      />
    </div>
  );
}
