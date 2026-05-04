// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Formatting toolbar for the WysiwygPane (SPEC.md §5.2 / ROADMAP Phase 2 M2).
 *
 * Provides buttons for: Bold, Italic, Underline, Strikethrough, Code,
 * H1–H4, Blockquote, Ordered List, Unordered List, Task List, Horizontal Rule,
 * Link insert/remove.
 */

import React, { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import useLayoutStore from "../stores/layoutStore";
import { noteStem, drawingFilename } from "../utils/drawingSidecar";

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "2px 6px",
        border: "none",
        borderRadius: "3px",
        cursor: disabled ? "default" : "pointer",
        background: active
          ? "var(--color-accent-muted, rgba(0,120,255,0.15))"
          : "transparent",
        color: disabled
          ? "var(--color-text-disabled)"
          : "var(--color-text-primary)",
        fontSize: "12px",
        fontFamily: "var(--font-prose)",
        fontWeight: active ? "bold" : "normal",
        lineHeight: "1.4",
        minWidth: "24px",
      }}
    >
      {children}
    </button>
  );
}

function Separator() {
  return (
    <span
      style={{
        display: "inline-block",
        width: "1px",
        height: "16px",
        background: "var(--color-border, #ccc)",
        margin: "0 4px",
        verticalAlign: "middle",
      }}
    />
  );
}

interface WysiwygToolbarProps {
  editor: ReturnType<typeof import("@tiptap/react").useEditor> | null;
  tileId: string;
}

export default function WysiwygToolbar({
  editor,
  tileId,
}: WysiwygToolbarProps): React.ReactElement {
  const insertDrawing = useCallback(() => {
    if (!editor) return;
    const tile = useLayoutStore.getState().tiles[tileId];
    const notePath = tile?.filePath;
    if (!notePath) return;
    invoke<number>("next_drawing_number", { notePath })
      .then((n) => {
        const stem = noteStem(notePath);
        const filename = drawingFilename(stem, n);
        editor.chain().focus().insertContent({
          type: "drawingBlock",
          attrs: { filename },
        }).run();
      })
      .catch(console.error);
  }, [editor, tileId]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div
        style={{
          height: "32px",
          borderBottom: "1px solid var(--color-border, #ccc)",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      data-testid="wysiwyg-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "2px",
        padding: "4px 8px",
        borderBottom: "1px solid var(--color-border, #ccc)",
        background: "var(--color-bg-secondary, #f5f5f5)",
        flexShrink: 0,
        overflowX: "auto",
      }}
    >
      {/* Inline marks */}
      <ToolbarButton
        title="Bold (Mod+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        title="Italic (Mod+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        title="Underline (Mod+U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </ToolbarButton>
      <ToolbarButton
        title="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {"</>"}
      </ToolbarButton>

      <Separator />

      {/* Headings */}
      {([1, 2, 3, 4] as const).map((level) => (
        <ToolbarButton
          key={level}
          title={`Heading ${level}`}
          active={editor.isActive("heading", { level })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level }).run()
          }
        >
          {`H${level}`}
        </ToolbarButton>
      ))}

      <Separator />

      {/* Block elements */}
      <ToolbarButton
        title="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        "
      </ToolbarButton>
      <ToolbarButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •—
      </ToolbarButton>
      <ToolbarButton
        title="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        title="Task list"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        ☑
      </ToolbarButton>
      <ToolbarButton
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        —
      </ToolbarButton>

      <Separator />

      {/* Link */}
      <ToolbarButton
        title="Link"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        🔗
      </ToolbarButton>

      <Separator />

      {/* Table */}
      <ToolbarButton
        title="Insert table"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        ⊞
      </ToolbarButton>
      <ToolbarButton
        title="Add row after"
        onClick={() => editor.chain().focus().addRowAfter().run()}
        disabled={!editor.can().addRowAfter()}
      >
        +R
      </ToolbarButton>
      <ToolbarButton
        title="Add column after"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        disabled={!editor.can().addColumnAfter()}
      >
        +C
      </ToolbarButton>
      <ToolbarButton
        title="Delete row"
        onClick={() => editor.chain().focus().deleteRow().run()}
        disabled={!editor.can().deleteRow()}
      >
        -R
      </ToolbarButton>
      <ToolbarButton
        title="Delete column"
        onClick={() => editor.chain().focus().deleteColumn().run()}
        disabled={!editor.can().deleteColumn()}
      >
        -C
      </ToolbarButton>
      <ToolbarButton
        title="Delete table"
        onClick={() => editor.chain().focus().deleteTable().run()}
        disabled={!editor.can().deleteTable()}
      >
        ✕⊞
      </ToolbarButton>

      <Separator />

      {/* Drawing */}
      <ToolbarButton
        title="Insert drawing (C-c d)"
        onClick={insertDrawing}
      >
        ✏
      </ToolbarButton>

      <Separator />

      {/* Undo / Redo (provided by yUndoPlugin) */}
      <ToolbarButton
        title="Undo"
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↩
      </ToolbarButton>
      <ToolbarButton
        title="Redo"
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↪
      </ToolbarButton>
    </div>
  );
}
