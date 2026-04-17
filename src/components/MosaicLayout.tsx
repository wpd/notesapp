// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Main tiling layout built on react-mosaic.
 *
 * react-mosaic gives us the draggable resizable pane infrastructure.
 * We supply a custom renderToolbar so TileBar matches our design tokens.
 */

import React, { useCallback } from "react";
import { Mosaic, MosaicWindow, MosaicNode } from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";

import useLayoutStore from "../stores/layoutStore";
import TileBar from "./TileBar";
import EditorPane from "./EditorPane";
import PreviewPane from "./PreviewPane";
import { ErrorBoundary } from "./ErrorBoundary";

export default function MosaicLayout(): React.ReactElement {
  const { mosaicTree, tiles, setMosaicTree, focusTile, setTileFile } =
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
        No panes open.
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
        // Override react-mosaic default styles to match our theme
      }}
      className="mosaic-blueprint-theme notesapp-mosaic"
    >
      <Mosaic<string>
        value={mosaicTree}
        onChange={handleChange}
        renderTile={(id, path) => {
          const tile = tiles[id];
          if (!tile) {
            return (
              <MosaicWindow<string>
                key={id}
                path={path}
                title="Missing tile"
                renderToolbar={() => (
                  <div style={{ height: "30px", background: "var(--color-surface-dark)" }} />
                )}
              >
                <div
                  data-testid={`tile-missing-${id}`}
                  style={{
                    padding: "1rem",
                    color: "var(--color-text-disabled)",
                    fontFamily: "var(--font-prose)",
                  }}
                >
                  ⚠ Tile data not found
                </div>
              </MosaicWindow>
            );
          }

          return (
            <MosaicWindow<string>
              key={id}
              path={path}
              title={tile.filePath?.split("/").pop() ?? "(no file)"}
              renderToolbar={() => (
                <div>
                  <TileBar
                    tileId={id}
                    type={tile.type}
                    filePath={tile.filePath}
                  />
                </div>
              )}
            >
              <div
                data-testid={`tile-${id}`}
                data-tile-type={tile.type}
                onClick={() => focusTile(id)}
                onFocus={() => focusTile(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const path = e.dataTransfer.getData("text/notesapp-path");
                  if (path && tile.type === "editor") {
                    e.preventDefault();
                    setTileFile(id, path);
                    // Load the file into Y.Doc
                    import("../stores/editorStore")
                      .then(({ default: editorStore }) => {
                        const ydoc = editorStore
                          .getState()
                          .getOrCreateYDoc(path);
                        const ytext = ydoc.getText("content");
                        if (ytext.length === 0) {
                          import("@tauri-apps/api/core").then(({ invoke }) => {
                            invoke<string>("read_note", { path })
                              .then((content) => {
                                ydoc.transact(() => {
                                  if (ytext.length === 0)
                                    ytext.insert(0, content);
                                });
                              })
                              .catch(() => {});
                          });
                        }
                      })
                      .catch(() => {});
                  }
                }}
                style={{ height: "100%", overflow: "hidden" }}
              >
                <ErrorBoundary tileId={id}>
                  {tile.type === "editor" ? (
                    <EditorPane tileId={id} filePath={tile.filePath} />
                  ) : (
                    <PreviewPane tileId={id} filePath={tile.filePath} />
                  )}
                </ErrorBoundary>
              </div>
            </MosaicWindow>
          );
        }}
      />
    </div>
  );
}

