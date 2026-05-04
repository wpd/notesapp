// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import type { Editor } from "@tiptap/core";

const registry = new Map<string, Editor>();

export function registerWysiwygEditor(tileId: string, editor: Editor): void {
  registry.set(tileId, editor);
}

export function unregisterWysiwygEditor(tileId: string): void {
  registry.delete(tileId);
}

export function getWysiwygEditor(tileId: string): Editor | undefined {
  return registry.get(tileId);
}
