// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useEffect, useRef, useState, useCallback } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { emacs } from "@replit/codemirror-emacs";
import { yCollab } from "y-codemirror.next";
import { invoke } from "@tauri-apps/api/core";
import useEditorStore from "../stores/editorStore";
import useLayoutStore from "../stores/layoutStore";
import useProjectStore from "../stores/projectStore";
import { notesAppTheme } from "../utils/editorTheme";
import { spellcheckSuppression } from "../utils/spellcheckSuppression";
import { spellcheckTrigger } from "../utils/spellcheckTrigger";
import { spellingDecorations } from "../utils/spellingDecorations";
import { mathMermaidHighlight } from "../utils/mathMermaidHighlight";
import { disableMacosAutoSubstitution } from "../utils/disableMacosAutoSubstitution";

interface EditorPaneProps {
  tileId: string;
  filePath: string | null;
}

const wordWrapCompartment = new Compartment();

export default function EditorPane({
  tileId,
  filePath,
}: EditorPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const {
    getOrCreateYDoc,
    setDirty,
    startAutosave,
    stopAutosave,
    setCursorLine,
    setSavedContent,
  } = useEditorStore();
  const { focusTile, setTileMissing } = useLayoutStore();
  const wordWrap = useLayoutStore((s) => s.wordWrap[tileId] ?? true);
  const focusedTileId = useLayoutStore((s) => s.focusedTileId);

  // Load file content into the Y.Doc when filePath changes.
  useEffect(() => {
    if (!filePath) return;
    const ydoc = getOrCreateYDoc(filePath);
    const ytext = ydoc.getText("content");

    if (ytext.length === 0) {
      invoke<string>("read_note", { path: filePath })
        .then((content) => {
          if (ytext.length === 0) {
            // Record the on-disk baseline BEFORE inserting so that the
            // yCollab-triggered updateListener sees clean content and does
            // not spuriously set the dirty flag (SPEC.md §5.1, §9.1).
            setSavedContent(filePath, content);
            ydoc.transact(() => {
              ytext.insert(0, content);
            });
          }
        })
        .catch(() => {
          setTileMissing(tileId, filePath);
        });
    }
  }, [filePath, getOrCreateYDoc, setSavedContent, tileId, setTileMissing]);

  // Build / rebuild the CodeMirror view
  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const ydoc = filePath ? getOrCreateYDoc(filePath) : null;
    const ytext = ydoc?.getText("content") ?? null;

    const updateCounts = (text: string) => {
      setCharCount(text.length);
      setWordCount(text.trim() === "" ? 0 : text.trim().split(/\s+/).length);
    };

    const extensions = [
      emacs(),
      history(),
      lineNumbers(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      notesAppTheme,
      wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      ...disableMacosAutoSubstitution,
      spellcheckSuppression,
      spellcheckTrigger,
      spellingDecorations,
      mathMermaidHighlight,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const currentContent = update.state.doc.toString();
          if (filePath) {
            const editorStore = useEditorStore.getState();
            if (editorStore.isContentClean(filePath, currentContent)) {
              // Undo returned to the saved state (or initial Y.Doc load).
              // Clear dirty for every tile bound to this file, stop their
              // autosave timers, and delete the .tmp file (SPEC.md §5.1, §9.1).
              const boundTiles = Object.values(
                useLayoutStore.getState().tiles,
              ).filter((t) => t.filePath === filePath);
              for (const t of boundTiles) {
                editorStore.setDirty(t.id, false);
                editorStore.stopAutosave(t.id);
              }
              void invoke("delete_tmp", { path: filePath }).catch(() => {});
            } else {
              const wasClean = !editorStore.isDirty(tileId);
              if (wasClean) {
                // First dirty edit since last save — arm the autosave timer.
                startAutosave(tileId, filePath);
              }
              setDirty(tileId, true);
            }
          } else {
            setDirty(tileId, true);
          }
          updateCounts(currentContent);
        }
        if (filePath && (update.docChanged || update.selectionSet)) {
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head).number;
          setCursorLine(filePath, line);
        }
      }),
      EditorView.domEventHandlers({
        focus: () => {
          focusTile(tileId);
          return false;
        },
      }),
    ];

    if (ytext) {
      extensions.push(yCollab(ytext, null));
    }

    const startState = EditorState.create({
      doc: ytext?.toString() ?? "",
      extensions,
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    viewRef.current = view;
    updateCounts(view.state.doc.toString());

    if (filePath) {
      startAutosave(tileId, filePath);
    }

    return () => {
      if (filePath) stopAutosave(tileId);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, tileId]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: wordWrapCompartment.reconfigure(
        wordWrap ? EditorView.lineWrapping : [],
      ),
    });
  }, [wordWrap]);

  // Push DOM focus into this editor when the layout store targets this tile.
  // Without this, C-x N / C-x o only update store state and typing goes nowhere.
  useEffect(() => {
    if (focusedTileId === tileId && viewRef.current) {
      viewRef.current.focus();
    }
  }, [focusedTileId, tileId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s" && filePath) {
        e.preventDefault();
        const editorState = useEditorStore.getState();
        const layoutState = useLayoutStore.getState();
        void editorState.saveFile(tileId, filePath).then(() => {
          const dir = useProjectStore.getState().projectDir;
          if (dir) return layoutState.persistLayout(dir);
        });
      }
    },
    [filePath, tileId],
  );

  return (
    <div
      data-testid={`editor-pane-${tileId}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--color-bg-primary)",
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Editor area */}
      <div
        ref={containerRef}
        data-testid={`codemirror-editor-${tileId}`}
        style={{
          flex: 1,
          overflow: "auto",
          fontFamily: "var(--font-editor)",
          fontSize: "var(--font-size-editor-default)",
        }}
      />

      {/* Status bar — live word/character count */}
      <div
        data-testid={`editor-status-${tileId}`}
        style={{
          height: "20px",
          padding: "0 8px",
          background: "var(--color-surface-dark)",
          color: "rgba(255,255,255,0.5)",
          fontFamily: "var(--font-prose)",
          fontSize: "11px",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <span>
          {wordCount} words · {charCount} chars
        </span>
      </div>
    </div>
  );
}
