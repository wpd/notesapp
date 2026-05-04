// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Yjs bridge between Y.Text("content") and Y.XmlFragment("prosemirror").
 *
 * Architecture (per SPEC.md §5.2):
 *   Y.Text  ──forward──▶  Y.XmlFragment  ──ySyncPlugin──▶  Tiptap EditorState
 *   Y.Text  ◀─reverse──   Tiptap EditorState (Tiptap update listener)
 *
 * Origin tags prevent feedback loops:
 *   BRIDGE_ORIGIN_PROSE  — set when the reverse bridge writes Y.Text
 *                          (forward bridge skips changes with this origin)
 *   BRIDGE_ORIGIN_TEXT   — set when the forward bridge writes Y.XmlFragment
 *                          (ySyncPlugin marks those PM transactions with
 *                          isChangeOrigin so reverse bridge skips them)
 */

import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment, ySyncPluginKey } from "y-prosemirror";
import type { Schema } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { splitFrontmatter } from "../utils/markdownPipeline";
import { markdownToProseMirror } from "./markdownToProseMirror";
import { proseMirrorToMarkdown } from "./proseMirrorToMarkdown";

export const BRIDGE_ORIGIN_TEXT = "text-bridge";
export const BRIDGE_ORIGIN_PROSE = "tiptap-bridge";

export interface TiptapBridgeOptions {
  ydoc: Y.Doc;
  schema: Schema;
}

export interface TiptapBridge {
  /** Fire the forward bridge once immediately (no debounce). */
  syncNow: () => void;
  /**
   * Attach a Tiptap Editor to receive reverse-bridge update events.
   * Call once the editor is ready. Pass null to detach.
   */
  setEditor: (editor: Editor | null) => void;
  /** Tear down observers and timers. */
  destroy: () => void;
}

/**
 * Create the bidirectional bridge for a Y.Doc.
 *
 * Forward: Y.Text observer → markdown parse → Y.XmlFragment update.
 * Reverse: Tiptap update listener → markdown serialize → Y.Text replace.
 *
 * Call `bridge.setEditor(editor)` once the Tiptap Editor is mounted.
 * Call `bridge.destroy()` when the tile unmounts.
 */
export function createTiptapBridge({
  ydoc,
  schema,
}: TiptapBridgeOptions): TiptapBridge {
  const ytext = ydoc.getText("content");
  const xfrag = ydoc.getXmlFragment("prosemirror");
  const meta = ydoc.getMap<string>("meta");

  let destroyed = false;
  let forwardTimer: ReturnType<typeof setTimeout> | null = null;
  let reverseTimer: ReturnType<typeof setTimeout> | null = null;
  let tiptapEditor: Editor | null = null;

  // ── Forward bridge: Y.Text → Y.XmlFragment ────────────────────────────────

  const syncForward = () => {
    if (destroyed) return;
    const md = ytext.toString();
    const { frontmatter, body } = splitFrontmatter(md);

    if (meta.get("frontmatter") !== frontmatter) {
      ydoc.transact(() => {
        meta.set("frontmatter", frontmatter);
      }, BRIDGE_ORIGIN_TEXT);
    }

    const pmJSON = markdownToProseMirror(body);
    ydoc.transact(() => {
      prosemirrorJSONToYXmlFragment(schema, pmJSON, xfrag);
    }, BRIDGE_ORIGIN_TEXT);
  };

  const debouncedForward = () => {
    if (forwardTimer !== null) clearTimeout(forwardTimer);
    forwardTimer = setTimeout(syncForward, 150);
  };

  const ytextObserver = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === BRIDGE_ORIGIN_PROSE) return;
    debouncedForward();
  };

  ytext.observe(ytextObserver);

  // ── Reverse bridge: Tiptap update → Y.Text ───────────────────────────────

  const syncReverse = (editor: Editor) => {
    if (destroyed) return;
    const md = proseMirrorToMarkdown(editor.state.doc);
    const frontmatter = meta.get("frontmatter") ?? "";
    const full = frontmatter + md;

    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, full);
    }, BRIDGE_ORIGIN_PROSE);
  };

  // Called by setEditor once an editor is attached (not called in M1 since
  // editable:false — the listener is a no-op until the editor is set editable).
  const handleEditorUpdate = ({ editor }: { editor: Editor }) => {
    if (destroyed || !editor.isEditable) return;

    // Skip transactions that originated from ySyncPlugin (Y.XmlFragment → PM)
    const pluginState = ySyncPluginKey.getState(editor.state) as
      | { isChangeOrigin?: boolean }
      | undefined;
    if (pluginState?.isChangeOrigin) return;

    if (reverseTimer !== null) clearTimeout(reverseTimer);
    reverseTimer = setTimeout(() => syncReverse(editor), 150);
  };

  return {
    syncNow: syncForward,

    setEditor(editor: Editor | null) {
      if (tiptapEditor) {
        tiptapEditor.off("update", handleEditorUpdate);
      }
      tiptapEditor = editor;
      if (editor) {
        editor.on("update", handleEditorUpdate);
      }
    },

    destroy() {
      destroyed = true;
      if (forwardTimer !== null) clearTimeout(forwardTimer);
      if (reverseTimer !== null) clearTimeout(reverseTimer);
      ytext.unobserve(ytextObserver);
      if (tiptapEditor) {
        tiptapEditor.off("update", handleEditorUpdate);
        tiptapEditor = null;
      }
    },
  };
}
