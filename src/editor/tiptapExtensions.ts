// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { MathInline, MathDisplay } from "./nodes/KatexNode";
import { MermaidBlock } from "./nodes/MermaidNode";
import { DrawingBlock } from "./nodes/DrawingNode";

/**
 * Returns the Tiptap extension array used by all WysiwygPane instances.
 *
 * The schema defined here must stay consistent with the ProseMirror JSON
 * produced by markdownToProseMirror and consumed by proseMirrorToMarkdown.
 */
export function createTiptapExtensions(): Extensions {
  return [
    StarterKit.configure({
      // undoRedo is the Tiptap 3.x name; disabled because y-prosemirror's
      // yUndoPlugin will provide undo/redo when the reverse bridge lands in M2.
      undoRedo: false,
      // StarterKit 3.x includes Link; we add our own below with custom options.
      link: false,
      // StarterKit 3.x includes Underline; we keep it here (no custom config needed).
      underline: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: false,
    }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    MathInline,
    MathDisplay,
    MermaidBlock,
    DrawingBlock,
  ];
}
