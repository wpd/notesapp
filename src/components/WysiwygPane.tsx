// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * WysiwygPane — the bidirectional WYSIWYG Preview tile (SPEC.md §5.2).
 *
 * M1: read-only rendering driven by the forward bridge (Y.Text → Y.XmlFragment
 * → Tiptap).  The reverse bridge (user edits → Y.Text) lands in M2.
 */

import React, { useEffect, useRef, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { ySyncPlugin } from "y-prosemirror";
import { Extension } from "@tiptap/core";
import { invoke } from "@tauri-apps/api/core";
import useEditorStore from "../stores/editorStore";
import useLayoutStore from "../stores/layoutStore";
import { createTiptapExtensions } from "../editor/tiptapExtensions";
import { createTiptapBridge } from "../editor/tiptapBridge";
import { splitFrontmatter } from "../utils/markdownPipeline";
import { markdownToProseMirror } from "../editor/markdownToProseMirror";

interface WysiwygPaneProps {
  tileId: string;
  filePath: string | null;
}

export default function WysiwygPane({
  tileId,
  filePath,
}: WysiwygPaneProps): React.ReactElement {
  const { attachBridge, detachBridge } = useEditorStore();
  const { focusTile, setTileMissing } = useLayoutStore();
  const fontScale = useLayoutStore((s) => s.tileFontScale[tileId] ?? 1);

  // Hold a ref to the bridge so we can tear it down on cleanup
  const bridgeRef = useRef<ReturnType<typeof createTiptapBridge> | null>(null);

  // Build extensions with ySyncPlugin once per filePath mount.
  // We need the Y.Doc (specifically the xfrag) before the editor mounts so
  // that ySyncPlugin can bind to it during editor creation.
  const { extensions, xfragRef } = useMemo(() => {
    if (!filePath) {
      return { extensions: createTiptapExtensions(), xfragRef: null };
    }
    const ydoc = attachBridge(filePath);
    const xfrag = ydoc.getXmlFragment("prosemirror");

    const ySync = Extension.create({
      name: "ySyncBridge",
      addProseMirrorPlugins() {
        return [ySyncPlugin(xfrag)];
      },
    });

    return {
      extensions: [...createTiptapExtensions(), ySync],
      xfragRef: xfrag,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // Compute initial content from Y.Text (if it's already populated)
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
      editable: false,
      immediatelyRender: false,
      onFocus: () => focusTile(tileId),
    },
    [filePath],
  );

  // Load file into Y.Doc on mount / filePath change, then wire the bridge
  useEffect(() => {
    if (!filePath || !editor) return;

    const state = useEditorStore.getState();
    const ydoc = state.ydocs[filePath] ?? state.getOrCreateYDoc(filePath);
    const ytext = ydoc.getText("content");

    // Read file if Y.Doc is empty (first tile to open this note)
    const doMount = () => {
      const bridge = createTiptapBridge({
        ydoc,
        schema: editor.schema,
      });
      bridgeRef.current = bridge;

      // Populate the fragment immediately with the current Y.Text content
      bridge.syncNow();
    };

    if (ytext.length === 0) {
      invoke<string>("read_note", { path: filePath })
        .then((content) => {
          if (ytext.length === 0) {
            state.setSavedContent(filePath, content);
            ydoc.transact(() => {
              ytext.insert(0, content);
            });
          }
          doMount();
        })
        .catch(() => {
          setTileMissing(tileId, filePath);
        });
    } else {
      doMount();
    }

    return () => {
      bridgeRef.current?.destroy();
      bridgeRef.current = null;
      detachBridge(filePath);
    };
  // filePath and editor identity are the deps; editor is stable across re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, editor]);

  // Discard the xfragRef — used only via ySyncPlugin
  void xfragRef;

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
        overflow: "auto",
        background: "var(--color-bg-primary)",
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
  );
}
