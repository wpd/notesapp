// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { renderMarkdownSync } from "./markdownPipeline";

/**
 * Regex that heuristically detects whether plain-text clipboard content looks
 * like Markdown.  Used by WysiwygPane's `transformPastedText` to decide
 * whether to run the markdown → HTML pipeline before handing the string to
 * ProseMirror's clipboard parser.
 *
 * Matches the start of the first non-empty line against common Markdown
 * syntax markers: ATX headings, bold, underline-bold, italic, list items,
 * blockquotes, fenced code blocks, and LaTeX dollar signs.
 */
export const MARKDOWN_PASTE_RE =
  /^#{1,6} |^\*\*|^__|^\*[^*]|^_[^_]|^- |^\d+\. |^> |^```|^\$/;

/**
 * Transforms pasted plain text for insertion into the WYSIWYG editor.
 *
 * If the text appears to be Markdown, it is rendered to HTML so that
 * formatting (bold, italic, lists, tables, etc.) is preserved when ProseMirror
 * parses the result.  Plain-text pastes that don't look like Markdown pass
 * through unchanged.
 *
 * Called by WysiwygPane's `useEditor({ editorProps: { transformPastedText } })`
 * (SPEC.md §5.2 "Pasting content").
 */
export function transformPastedText(text: string): string {
  if (MARKDOWN_PASTE_RE.test(text.trim())) {
    try {
      return renderMarkdownSync(text);
    } catch {
      return text;
    }
  }
  return text;
}
