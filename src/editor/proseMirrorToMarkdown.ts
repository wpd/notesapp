// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Serialize a ProseMirror document to a markdown string.
 *
 * Extends prosemirror-markdown's defaultMarkdownSerializer with custom node
 * handlers for the node types defined in tiptapExtensions.ts that are not in
 * the default schema: mathInline, mathDisplay, mermaidBlock, drawingBlock,
 * taskList, taskItem, hardBreak, and the underline mark.
 */

import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import type { Node as PMNode, Mark } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";

function cellText(cell: PMNode): string {
  let out = "";
  cell.forEach((block) => {
    if (block.type.name !== "paragraph") return;
    block.forEach((inline) => {
      if (inline.type.name !== "text") return;
      const raw = (inline.text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      const hasBold = inline.marks.some((m) => m.type.name === "bold");
      const hasItalic = inline.marks.some((m) => m.type.name === "italic");
      const hasCode = inline.marks.some((m) => m.type.name === "code");
      let s = raw;
      if (hasCode) s = `\`${s}\``;
      if (hasBold) s = `**${s}**`;
      if (hasItalic) s = `_${s}_`;
      out += s;
    });
  });
  return out;
}

const customSerializer = new MarkdownSerializer(
  {
    // ── Inherit all default node handlers ──────────────────────────────────
    ...defaultMarkdownSerializer.nodes,

    // ── Hard break → two spaces + newline (GitHub Markdown) ────────────────
    hardBreak(state) {
      state.write("  \n");
    },

    // ── Horizontal rule ─────────────────────────────────────────────────────
    horizontalRule(state) {
      state.write("---");
      state.closeBlock({ nodeSize: 1 } as PMNode);
    },

    // ── Inline math ($...$) ──────────────────────────────────────────────────
    mathInline(state, node) {
      state.write(`$${node.attrs.latex as string}$`);
    },

    // ── Display math ($$...$$) ───────────────────────────────────────────────
    mathDisplay(state, node) {
      state.write(`$$\n${node.attrs.latex as string}\n$$`);
      state.closeBlock(node);
    },

    // ── Mermaid fenced block ─────────────────────────────────────────────────
    mermaidBlock(state, node) {
      state.write("```mermaid\n");
      state.write(node.attrs.code as string);
      state.write("\n```");
      state.closeBlock(node);
    },

    // ── Drawing fenced block ─────────────────────────────────────────────────
    drawingBlock(state, node) {
      state.write("```drawing\n");
      state.write(node.attrs.filename as string);
      state.write("\n```");
      state.closeBlock(node);
    },

    // ── Tiptap uses camelCase node names; alias the prosemirror-markdown defaults ─
    bulletList: defaultMarkdownSerializer.nodes.bullet_list,
    orderedList: defaultMarkdownSerializer.nodes.ordered_list,
    listItem: defaultMarkdownSerializer.nodes.list_item,

    // ── Task list → GFM task list syntax ────────────────────────────────────
    taskList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },

    taskItem(state, node) {
      const checkbox = node.attrs.checked ? "[x] " : "[ ] ";
      state.write(checkbox);
      state.renderContent(node);
    },

    // ── GFM table ────────────────────────────────────────────────────────────
    table(state, node) {
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => { cells.push(cellText(cell)); });
        rows.push(cells);
      });
      if (rows.length === 0) return;
      const colCount = Math.max(...rows.map((r) => r.length));
      const pad = (row: string[]) =>
        Array.from<string>({ length: colCount }).map((_, i) => row[i] ?? "");
      state.write("| " + pad(rows[0]).join(" | ") + " |");
      state.ensureNewLine();
      state.write("| " + pad(rows[0]).map(() => "---").join(" | ") + " |");
      state.ensureNewLine();
      for (let i = 1; i < rows.length; i++) {
        state.write("| " + pad(rows[i]).join(" | ") + " |");
        if (i < rows.length - 1) state.ensureNewLine();
      }
      state.closeBlock(node);
    },
    // Children are rendered by the table handler above; register as no-ops
    tableRow(_state, _node) {},
    tableHeader(_state, _node) {},
    tableCell(_state, _node) {},

    // ── Code block with language ─────────────────────────────────────────────
    codeBlock(state, node) {
      const lang = (node.attrs.language as string | null) ?? "";
      state.write(`\`\`\`${lang}\n`);
      state.text(node.textContent, false);
      state.write("\n```");
      state.closeBlock(node);
    },
  },
  {
    // ── Inherit default mark handlers then override/extend ───────────────────
    ...defaultMarkdownSerializer.marks,

    // ── Tiptap uses bold/italic; alias prosemirror-markdown's strong/em ────────
    bold: defaultMarkdownSerializer.marks.strong,
    // Use _ delimiters for italic so round-trips are stable (* would drift _text_ → *text*)
    italic: {
      open: "_",
      close: "_",
      mixable: true,
      expelEnclosingWhitespace: true,
    },

    // ── Strike (~~text~~) ────────────────────────────────────────────────────
    strike: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },

    // ── Underline — no standard markdown syntax; use HTML <u> passthrough ───
    underline: {
      open(_state: MarkdownSerializerState, _mark: Mark) { return "<u>"; },
      close(_state: MarkdownSerializerState, _mark: Mark) { return "</u>"; },
      mixable: false,
    },
  },
  { strict: false, hardBreakNodeName: "hardBreak" },
);

export function proseMirrorToMarkdown(doc: PMNode): string {
  return customSerializer.serialize(doc, { tightLists: true });
}
