// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Converts a markdown body string (without front-matter) to a ProseMirror
 * document JSON object compatible with the Tiptap schema defined in
 * tiptapExtensions.ts.
 *
 * Strategy: parse with remark (same plugins as markdownPipeline.ts) to obtain
 * an mdast tree, then recursively convert nodes to the ProseMirror JSON
 * format.  Inline content is flattened with accumulated marks.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type {
  Root,
  RootContent,
  Paragraph,
  Heading,
  Code,
  Blockquote,
  List,
  ListItem,
  Text,
  Strong,
  Emphasis,
  InlineCode,
  Link,
  Break,
  Image,
  Delete,
  Table,
  TableRow,
  TableCell,
  Html,
} from "mdast";

// ── ProseMirror JSON types ───────────────────────────────────────────────────

interface PMMark {
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
}

interface PMNode {
  type: string;
  text?: string;
  marks?: PMMark[];
  attrs?: Record<string, string | number | boolean | null>;
  content?: PMNode[];
}

// ── remark-math node types (augmentation) ───────────────────────────────────

interface InlineMath {
  type: "inlineMath";
  value: string;
}

interface MathBlock {
  type: "math";
  value: string;
}

// Union of all inline mdast node types we process
type InlineNode =
  | Text
  | Strong
  | Emphasis
  | InlineCode
  | Link
  | Break
  | Delete
  | Image
  | InlineMath
  | Html
  | { type: string; [key: string]: unknown };

// ── Lazy parser ──────────────────────────────────────────────────────────────

let _parser: ReturnType<typeof buildParser> | null = null;

function buildParser() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkMath);
}

function getParser() {
  if (!_parser) _parser = buildParser();
  return _parser;
}

// ── Inline content converter ─────────────────────────────────────────────────

function convertInline(
  children: InlineNode[],
  inheritedMarks: PMMark[] = [],
): PMNode[] {
  const result: PMNode[] = [];

  for (const child of children) {
    if (child.type === "text") {
      const node = child as Text;
      if (node.value) {
        result.push({
          type: "text",
          text: node.value,
          ...(inheritedMarks.length ? { marks: inheritedMarks } : {}),
        });
      }
    } else if (child.type === "strong") {
      const node = child as Strong;
      result.push(
        ...convertInline(node.children as InlineNode[], [
          ...inheritedMarks,
          { type: "bold" },
        ]),
      );
    } else if (child.type === "emphasis") {
      const node = child as Emphasis;
      result.push(
        ...convertInline(node.children as InlineNode[], [
          ...inheritedMarks,
          { type: "italic" },
        ]),
      );
    } else if (child.type === "delete") {
      const node = child as Delete;
      result.push(
        ...convertInline(node.children as InlineNode[], [
          ...inheritedMarks,
          { type: "strike" },
        ]),
      );
    } else if (child.type === "inlineCode") {
      const node = child as InlineCode;
      result.push({
        type: "text",
        text: node.value,
        marks: [...inheritedMarks, { type: "code" }],
      });
    } else if (child.type === "link") {
      const node = child as Link;
      result.push(
        ...convertInline(node.children as InlineNode[], [
          ...inheritedMarks,
          {
            type: "link",
            attrs: {
              href: node.url,
              title: node.title ?? null,
              target: null,
            },
          },
        ]),
      );
    } else if (child.type === "inlineMath") {
      const node = child as InlineMath;
      result.push({ type: "mathInline", attrs: { latex: node.value } });
    } else if (child.type === "break") {
      result.push({ type: "hardBreak" });
    } else if (child.type === "image") {
      // Images skipped in M1 — placeholder text
      const node = child as Image;
      result.push({
        type: "text",
        text: `[image: ${node.alt ?? node.url}]`,
        ...(inheritedMarks.length ? { marks: inheritedMarks } : {}),
      });
    }
    // html, footnoteReference, etc. — ignored in M1
  }

  return result;
}

// ── Block content converter ──────────────────────────────────────────────────

function convertListItem(item: ListItem, isTask: boolean): PMNode | null {
  const itemChildren = (item.children as RootContent[]).flatMap((c) =>
    convertBlock(c as BlockNode),
  );
  const nonEmpty = itemChildren.filter(Boolean) as PMNode[];

  if (isTask) {
    return {
      type: "taskItem",
      attrs: { checked: item.checked ?? false },
      content: nonEmpty.length > 0 ? nonEmpty : [{ type: "paragraph", content: [] }],
    };
  }

  return {
    type: "listItem",
    content: nonEmpty.length > 0 ? nonEmpty : [{ type: "paragraph", content: [] }],
  };
}

function convertTableCell(cell: TableCell, isHeader: boolean): PMNode {
  const inline = convertInline(cell.children as InlineNode[]);
  const nodeType = isHeader ? "tableHeader" : "tableCell";
  return {
    type: nodeType,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: "paragraph", content: inline }],
  };
}

function convertTableRow(
  row: TableRow,
  rowIndex: number,
): PMNode {
  return {
    type: "tableRow",
    content: (row.children as TableCell[]).map((cell) =>
      convertTableCell(cell, rowIndex === 0),
    ),
  };
}

type BlockNode =
  | RootContent
  | MathBlock
  | { type: string; [key: string]: unknown };

function convertBlock(node: BlockNode): PMNode[] {
  switch (node.type) {
    case "paragraph": {
      const p = node as Paragraph;
      const inline = convertInline(p.children as InlineNode[]);
      if (inline.length === 0) return [];
      return [{ type: "paragraph", content: inline }];
    }

    case "heading": {
      const h = node as Heading;
      return [
        {
          type: "heading",
          attrs: { level: h.depth },
          content: convertInline(h.children as InlineNode[]),
        },
      ];
    }

    case "code": {
      const c = node as Code;
      const lang = c.lang ?? "";
      if (lang === "mermaid") {
        return [{ type: "mermaidBlock", attrs: { code: c.value } }];
      }
      if (lang === "drawing") {
        return [{ type: "drawingBlock", attrs: { filename: c.value.trim() } }];
      }
      return [
        {
          type: "codeBlock",
          attrs: { language: lang || null },
          content: c.value ? [{ type: "text", text: c.value }] : [],
        },
      ];
    }

    case "blockquote": {
      const bq = node as Blockquote;
      const inner = (bq.children as RootContent[]).flatMap((c) =>
        convertBlock(c as BlockNode),
      );
      return [
        {
          type: "blockquote",
          content: inner.length > 0 ? inner : [{ type: "paragraph", content: [] }],
        },
      ];
    }

    case "list": {
      const l = node as List;
      const isTask = l.children.some(
        (item) => (item as ListItem).checked !== null && (item as ListItem).checked !== undefined,
      );
      if (isTask) {
        return [
          {
            type: "taskList",
            content: l.children
              .map((item) => convertListItem(item as ListItem, true))
              .filter(Boolean) as PMNode[],
          },
        ];
      }
      const listType = l.ordered ? "orderedList" : "bulletList";
      return [
        {
          type: listType,
          ...(l.ordered ? { attrs: { start: l.start ?? 1 } } : {}),
          content: l.children
            .map((item) => convertListItem(item as ListItem, false))
            .filter(Boolean) as PMNode[],
        },
      ];
    }

    case "thematicBreak": {
      return [{ type: "horizontalRule" }];
    }

    case "math": {
      const m = node as MathBlock;
      return [{ type: "mathDisplay", attrs: { latex: m.value } }];
    }

    case "table": {
      const t = node as Table;
      return [
        {
          type: "table",
          content: (t.children as TableRow[]).map((row, idx) =>
            convertTableRow(row, idx),
          ),
        },
      ];
    }

    case "html":
    case "definition":
    case "footnoteDefinition":
      // Skip raw HTML and definition nodes
      return [];

    default:
      return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a markdown body string (no front-matter) to a ProseMirror JSON doc.
 *
 * Returns a `{ type: "doc", content: [...] }` object suitable for
 * `editor.commands.setContent()` or `Node.fromJSON(schema, json)`.
 */
export function markdownToProseMirror(markdownBody: string): PMNode {
  const parser = getParser();
  const tree = parser.parse(markdownBody) as Root;

  const content = tree.children.flatMap((child) =>
    convertBlock(child as BlockNode),
  );

  // ProseMirror requires at least one block in the doc
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph", content: [] }],
  };
}

export type { PMNode, PMMark };
