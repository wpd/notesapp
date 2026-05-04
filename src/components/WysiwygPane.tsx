// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * WysiwygPane — bidirectional WYSIWYG tile (SPEC.md §5.2).
 *
 * Tiptap editor bound to Y.XmlFragment via ySyncPlugin.
 * Forward bridge: Y.Text → Y.XmlFragment (CodeMirror edits appear here).
 * Reverse bridge: Tiptap edits → Y.Text (round-trips back to CodeMirror).
 */

import React, { useEffect, useRef, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { ySyncPlugin, yUndoPlugin } from "y-prosemirror";
import { Extension } from "@tiptap/core";
import { invoke } from "@tauri-apps/api/core";
import useEditorStore from "../stores/editorStore";
import useLayoutStore from "../stores/layoutStore";
import { createTiptapExtensions } from "../editor/tiptapExtensions";
import { createTiptapBridge } from "../editor/tiptapBridge";
import { splitFrontmatter } from "../utils/markdownPipeline";
import { markdownToProseMirror } from "../editor/markdownToProseMirror";
import { registerWysiwygEditor, unregisterWysiwygEditor } from "../editor/wysiwygRegistry";
import WysiwygToolbar from "./WysiwygToolbar";

interface WysiwygPaneProps {
  tileId: string;
  filePath: string | null;
}

export default function WysiwygPane({
  tileId,
  filePath,
}: WysiwygPaneProps): React.ReactElement {
  const {
    attachBridge,
    detachBridge,
    setDirty,
    isContentClean,
    setSavedContent,
    startAutosave,
    stopAutosave,
  } = useEditorStore();
  const { focusTile, setTileMissing } = useLayoutStore();
  const fontScale = useLayoutStore((s) => s.tileFontScale[tileId] ?? 1);

  const bridgeRef = useRef<ReturnType<typeof createTiptapBridge> | null>(null);

  // Build extensions including ySyncPlugin once per filePath mount.
  const { extensions, xfragRef, ydocRef } = useMemo(() => {
    if (!filePath) {
      return { extensions: createTiptapExtensions(), xfragRef: null, ydocRef: null };
    }
    const ydoc = attachBridge(filePath);
    const xfrag = ydoc.getXmlFragment("prosemirror");

    const ySync = Extension.create({
      name: "ySyncBridge",
      addProseMirrorPlugins() {
        return [ySyncPlugin(xfrag), yUndoPlugin()];
      },
    });

    return {
      extensions: [...createTiptapExtensions(), ySync],
      xfragRef: xfrag,
      ydocRef: ydoc,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // Compute initial content from Y.Text if already populated
  const initialContent = useMemo(() => {
    if (!filePath) return null;
    const ydoc = useEditorStore.getState().ydocs[filePath];
    if (!ydoc) return null;
    const ytext = ydoc.getText("content");
    const md = ytext.toString();
    if (!md) return null;
    const { body } = splitFrontmatter(md);
    return markdownToProseMirror(body);
  }, [filePath]);

  const editor = useEditor(
    {
      extensions,
      content: initialContent ?? { type: "doc", content: [] },
      editable: true,
      immediatelyRender: false,
      onFocus: () => focusTile(tileId),
    },
    [filePath],
  );

  // Register editor in wysiwyg registry for C-c d shortcut dispatch
  useEffect(() => {
    if (!editor) return;
    registerWysiwygEditor(tileId, editor);
    return () => { unregisterWysiwygEditor(tileId); };
  }, [tileId, editor]);

  // Provide note directory to DrawingBlock node views via editor storage
  useEffect(() => {
    if (!editor || !filePath) return;
    const dir = filePath.split("/").slice(0, -1).join("/");
    const storage = editor.storage as unknown as Record<string, Record<string, string>>;
    if (storage.drawingBlock) {
      storage.drawingBlock.noteDirectory = dir;
    }
  }, [editor, filePath]);

  // Load file, wire bridge, wire reverse-sync dirty tracking
  useEffect(() => {
    if (!filePath || !editor) return;

    const state = useEditorStore.getState();
    const ydoc = state.ydocs[filePath] ?? state.getOrCreateYDoc(filePath);
    const ytext = ydoc.getText("content");

    const doMount = () => {
      const bridge = createTiptapBridge({ ydoc, schema: editor.schema });
      bridgeRef.current = bridge;

      bridge.syncNow();

      // Wire reverse bridge: editor updates → Y.Text
      bridge.setEditor(editor);

      // Track dirty state via Y.Text changes that originated from Tiptap edits
      // (BRIDGE_ORIGIN_PROSE). Compare against savedContent to detect dirty.
      const ytextObserver = (
        _e: import("yjs").YTextEvent,
        tx: import("yjs").Transaction,
      ) => {
        if (tx.origin !== "tiptap-bridge") return;
        const full = ytext.toString();
        if (isContentClean(filePath, full)) {
          setDirty(tileId, false);
          stopAutosave(tileId);
          void invoke("delete_tmp", { path: filePath }).catch(() => {});
        } else {
          const wasClean = !useEditorStore.getState().isDirty(tileId);
          setDirty(tileId, true);
          if (wasClean) {
            startAutosave(tileId, filePath);
          }
        }
      };
      ytext.observe(ytextObserver);

      // Cleanup: remove observer, destroy bridge, detach ydoc
      return () => {
        ytext.unobserve(ytextObserver);
        bridge.destroy();
        bridgeRef.current = null;
        stopAutosave(tileId);
        setDirty(tileId, false);
        detachBridge(filePath);
      };
    };

    if (ytext.length === 0) {
      let cleanup: (() => void) | undefined;
      invoke<string>("read_note", { path: filePath })
        .then((content) => {
          if (ytext.length === 0) {
            setSavedContent(filePath, content);
            ydoc.transact(() => {
              ytext.insert(0, content);
            });
          }
          cleanup = doMount();
        })
        .catch(() => {
          setTileMissing(tileId, filePath);
        });
      return () => { cleanup?.(); };
    } else {
      const cleanup = doMount();
      return cleanup ?? (() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, editor]);

  void xfragRef;
  void ydocRef;

  if (!filePath) {
    return (
      <div
        data-testid={`preview-empty-${tileId}`}
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          background: "var(--color-bg-primary)",
          color: "var(--color-text-disabled)",
          fontFamily: "var(--font-prose)",
        }}
      >
        <p>No note bound to this tile.</p>
        <p style={{ fontSize: "12px", marginTop: "0.5rem" }}>
          Open a file with <kbd>C-x b</kbd> or the ▾ dropdown
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid={`preview-pane-${tileId}`}
      onClick={() => focusTile(tileId)}
      style={{
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-primary)",
      }}
    >
      <WysiwygToolbar editor={editor} tileId={tileId} />
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "1rem 1.5rem",
          fontFamily: "var(--font-prose)",
          fontSize: `calc(var(--font-size-prose-default) * ${fontScale})`,
          color: "var(--color-text-primary)",
          lineHeight: "1.65",
        }}
      >
        <EditorContent
          data-testid={`preview-content-${tileId}`}
          editor={editor}
          className="prose-content wysiwyg-content"
        />
      </div>
    </div>
  );
}
