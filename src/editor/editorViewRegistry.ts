// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import type { EditorView } from "@codemirror/view";

const registry = new Map<string, EditorView>();

export function registerEditorView(tileId: string, view: EditorView): void {
  registry.set(tileId, view);
}

export function unregisterEditorView(tileId: string): void {
  registry.delete(tileId);
}

export function getEditorView(tileId: string): EditorView | undefined {
  return registry.get(tileId);
}
