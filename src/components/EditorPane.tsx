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

interface EditorPaneProps {
  tileId: string;
  filePath: string | null;
}

// Compartment for word-wrap — allows dynamic reconfigure without destroying the view
const wordWrapCompartment = new Compartment();

export default function EditorPane({
  tileId,
  filePath,
}: EditorPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [wordWrap, setWordWrap] = useState(true);
  const [fileMissing, setFileMissing] = useState(false);

  const { getOrCreateYDoc, setDirty, startAutosave, stopAutosave, setCursorLine } =
    useEditorStore();
  const { focusTile } = useLayoutStore();

  // Load file content into the Y.Doc when filePath changes.
  // If `read_note` rejects, treat the file as missing on disk and render the
  // ⚠ File not found card — this typically indicates a restored layout that
  // references a file the user has since deleted.
  useEffect(() => {
    setFileMissing(false);
    if (!filePath) return;
    const ydoc = getOrCreateYDoc(filePath);
    const ytext = ydoc.getText("content");

    // Only load from disk if Y.Doc is empty (not already populated from another tile)
    if (ytext.length === 0) {
      invoke<string>("read_note", { path: filePath })
        .then((content) => {
          if (ytext.length === 0) {
            ydoc.transact(() => {
              ytext.insert(0, content);
            });
          }
        })
        .catch(() => {
          setFileMissing(true);
        });
    }
  }, [filePath, getOrCreateYDoc]);

  // Build / rebuild the CodeMirror view when filePath or tileId changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy previous view
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const ydoc = filePath ? getOrCreateYDoc(filePath) : null;
    const ytext = ydoc?.getText("content") ?? null;

    // Word/char counter update listener
    const updateCounts = (text: string) => {
      setCharCount(text.length);
      setWordCount(text.trim() === "" ? 0 : text.trim().split(/\s+/).length);
    };

    const extensions = [
      // emacs() must come before the default keymap so its bindings win.
      // It registers C-f/b/n/p, M-f/b, C-a/e, C-k, C-y, C-space, C-w, M-w,
      // C-/ (undo), C-g, M-<, M->, incremental search, query-replace, and
      // the kill-ring.  C-x prefix chords are intercepted at the document
      // level by useKeyboardShortcuts before they reach CodeMirror.
      emacs(),
      history(),
      lineNumbers(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      notesAppTheme,
      wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      // Enable the webview's native spellcheck for prose.  Code blocks and
      // inline code are suppressed via the `.cm-line` CSS rule that disables
      // spellcheck within `.tok-monospace` / code spans (see editorTheme).
      EditorView.contentAttributes.of({ spellcheck: "true" }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          setDirty(tileId, true);
          updateCounts(update.state.doc.toString());
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

    // Add Yjs collaboration (awareness=null → local only, no network sync for Phase 1)
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

    // Start autosave
    if (filePath) {
      startAutosave(tileId, filePath);
    }

    return () => {
      if (filePath) stopAutosave(tileId);
      view.destroy();
      viewRef.current = null;
    };
    // wordWrap is intentionally excluded — handled by a separate effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, tileId]);

  // Dynamically update word wrap without destroying the view
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: wordWrapCompartment.reconfigure(
        wordWrap ? EditorView.lineWrapping : [],
      ),
    });
  }, [wordWrap]);

  const isPinned = useLayoutStore((s) => s.pinnedTileId) === tileId;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // C-x C-s also handled here for immediate response when editor is focused
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
      {fileMissing && filePath && (
        <div
          data-testid={`file-not-found-${tileId}`}
          style={{
            padding: "0.75rem 1rem",
            background: "rgba(217,119,6,0.08)",
            color: "var(--color-warning)",
            borderBottom: "1px solid var(--color-border)",
            fontFamily: "var(--font-prose)",
            fontSize: "13px",
            flexShrink: 0,
          }}
        >
          <span aria-hidden="true">⚠ </span>
          File not found on disk:{" "}
          <code style={{ fontFamily: "var(--font-editor)" }}>{filePath}</code>
        </div>
      )}

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

      {/* Status bar */}
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
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span>
          {wordCount} words · {charCount} chars
        </span>
        <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {isPinned && (
            <span
              data-testid={`pinned-indicator-${tileId}`}
              style={{ color: "var(--color-accent)" }}
              title="Pinned — Insert into Note target"
            >
              📌
            </span>
          )}
          <button
            data-testid={`word-wrap-toggle-${tileId}`}
            onClick={() => setWordWrap((w) => !w)}
            style={{
              background: "transparent",
              border: "none",
              color: wordWrap
                ? "var(--color-accent)"
                : "rgba(255,255,255,0.4)",
              cursor: "pointer",
              fontSize: "10px",
              padding: "0 2px",
            }}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          >
            ⏎
          </button>
        </span>
      </div>
    </div>
  );
}

