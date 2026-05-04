// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Yjs bridge between Y.Text("content") and Y.XmlFragment("prosemirror").
 *
 * Architecture (per SPEC.md §5.2):
 *   Y.Text  ──forward──▶  Y.XmlFragment  ──ySyncPlugin──▶  Tiptap EditorState
 *   Y.Text  ◀─reverse──   Tiptap EditorState   (M2+)
 *
 * M1 implements the forward direction only (Preview tile is read-only).
 * The reverse direction (Tiptap edits → Y.Text) lands in M2.
 *
 * Origin tags prevent feedback loops:
 *   BRIDGE_ORIGIN_PROSE  — set when the reverse bridge writes Y.Text
 *                          (forward bridge skips changes with this origin)
 *   BRIDGE_ORIGIN_TEXT   — set when the forward bridge writes Y.XmlFragment
 *                          (ySyncPlugin-generated PM transactions have
 *                          `isChangeOrigin(tr) === true` so reverse skips them)
 */

import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import type { Schema } from "@tiptap/pm/model";
import { splitFrontmatter } from "../utils/markdownPipeline";
import { markdownToProseMirror } from "./markdownToProseMirror";

export const BRIDGE_ORIGIN_TEXT = "text-bridge";
export const BRIDGE_ORIGIN_PROSE = "tiptap-bridge";

export interface TiptapBridgeOptions {
  ydoc: Y.Doc;
  schema: Schema;
}

export interface TiptapBridge {
  /** Fire the forward bridge once immediately (no debounce). */
  syncNow: () => void;
  /** Tear down observers and timers. */
  destroy: () => void;
}

/**
 * Create the forward bridge for a Y.Doc.
 *
 * Observes `Y.Text("content")` changes and keeps `Y.XmlFragment("prosemirror")`
 * in sync via prosemirrorJSONToYXmlFragment.  The Tiptap editor binds to the
 * fragment via `ySyncPlugin` so it stays up to date automatically.
 *
 * Call `bridge.destroy()` when the last tile unbinds from the Y.Doc.
 */
export function createTiptapBridge({
  ydoc,
  schema,
}: TiptapBridgeOptions): TiptapBridge {
  const ytext = ydoc.getText("content");
  const xfrag = ydoc.getXmlFragment("prosemirror");
  const meta = ydoc.getMap<string>("meta");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const syncForward = () => {
    const md = ytext.toString();
    const { frontmatter, body } = splitFrontmatter(md);

    // Store frontmatter separately so the reverse bridge can prepend it
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

  const debouncedSync = () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(syncForward, 150);
  };

  const ytextObserver = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    // Skip changes that originated from the reverse bridge (Tiptap → Y.Text)
    if (transaction.origin === BRIDGE_ORIGIN_PROSE) return;
    debouncedSync();
  };

  ytext.observe(ytextObserver);

  return {
    syncNow: syncForward,
    destroy: () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      ytext.unobserve(ytextObserver);
    },
  };
}
