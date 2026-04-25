// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Shared markdown → HTML rendering pipeline.
 *
 * Uses:  unified → remark-parse → remark-frontmatter → remark-gfm → remark-math
 *              → remark-rehype → rehype-katex → rehype-raw → rehype-stringify
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

/**
 * Stamp top-level block elements with `data-source-line` so the preview can
 * scroll to the position of the editor cursor (best-effort scroll-sync).
 * Only block-level tags are stamped to keep inline markup clean.
 */
const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "pre",
  "table",
  "hr",
  "div",
]);

function rehypeAttachSourceLines() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!BLOCK_TAGS.has(node.tagName)) return;
      const pos = node.position;
      if (pos && pos.start && typeof pos.start.line === "number") {
        node.properties = node.properties ?? {};
        node.properties["dataSourceLine"] = String(pos.start.line);
      }
    });
  };
}

let _processor: ReturnType<typeof buildProcessor> | null = null;

function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter)   // parse & strip YAML front-matter
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex, { output: "html" })
    .use(rehypeRaw)
    .use(rehypeAttachSourceLines)
    .use(rehypeStringify);
}

function getProcessor() {
  if (!_processor) _processor = buildProcessor();
  return _processor;
}

/**
 * Render markdown to an HTML string.
 * Returns an error message string if rendering fails.
 */
export async function renderMarkdown(markdown: string): Promise<string> {
  try {
    const result = await getProcessor().process(markdown);
    return String(result);
  } catch (err) {
    return `<p style="color:var(--color-error)">[Render error: ${String(err)}]</p>`;
  }
}

/**
 * Synchronous version — for cases where async is not feasible.
 * Note: some rehype plugins are async-only; this may not apply KaTeX fully.
 */
export function renderMarkdownSync(markdown: string): string {
  try {
    const result = getProcessor().processSync(markdown);
    return String(result);
  } catch (err) {
    return `<p style="color:var(--color-error)">[Render error: ${String(err)}]</p>`;
  }
}
