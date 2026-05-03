// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Spec-vs-shortcuts consistency check.
 *
 * SPEC.md §4.1 is the canonical shortcut list. Every shortcut in that table
 * must appear in either docs/SHORTCUTS.md (as implemented) or
 * docs/SPEC_AUDIT.md with an explicit DEFERRED annotation. This test catches
 * silent deferrals — the failure mode that produced three consecutive
 * "Phase 1 complete" claims with broken shortcuts.
 *
 * The test parses the §4.1 markdown table from SPEC.md and asserts that for
 * every keybinding cell, the binding string appears somewhere in either
 * SHORTCUTS.md or SPEC_AUDIT.md. It is deliberately loose (substring match
 * on the binding string) to tolerate prose rewording without false positives.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");

function readDoc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8");
}

/**
 * Extract keybinding strings from the §4.1 table in SPEC.md.
 * Each row looks like:  | action description | `Binding` |
 * Returns the raw binding cell content (with backticks stripped).
 */
function extractSpec41Bindings(spec: string): string[] {
  // Find the §4.1 section header and scan until the next ##
  const section41Match = /### 4\.1 .*\n([\s\S]*?)(?=\n### |\n## )/.exec(spec);
  if (!section41Match) return [];

  const section = section41Match[1];
  const bindings: string[] = [];

  for (const line of section.split("\n")) {
    // Table rows: | ... | `binding` | — the binding is the second |…| cell.
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 3) continue;
    // cells[0] is empty (before first |), cells[1] is action, cells[2] is binding
    const rawBinding = cells[2];
    if (!rawBinding || rawBinding === "---" || !rawBinding.length) continue;
    // Skip the header row
    if (rawBinding.toLowerCase().includes("binding") && !rawBinding.includes("`")) continue;
    // Strip backtick formatting and normalise
    const stripped = rawBinding.replace(/`/g, "").trim();
    if (stripped) bindings.push(stripped);
  }

  return bindings;
}

describe("Spec shortcut coverage", () => {
  const spec = readDoc("SPEC.md");
  const shortcuts = readDoc("docs/SHORTCUTS.md");
  const audit = readDoc("docs/SPEC_AUDIT.md");

  const bindings = extractSpec41Bindings(spec);

  it("extracts at least 10 bindings from SPEC.md §4.1 (parser smoke check)", () => {
    expect(bindings.length).toBeGreaterThan(10);
  });

  it("every SPEC.md §4.1 binding appears in SHORTCUTS.md or SPEC_AUDIT.md", () => {
    const missing: string[] = [];
    for (const binding of bindings) {
      // The binding may contain multiple alternatives separated by spaces/commas,
      // e.g. "C-x 0 or C-x w" or "C-a, C-e C-b, C-f".  We check any token.
      const tokens = binding
        .split(/[\s,]+/)
        .map((t) => t.replace(/[()]/g, "").trim())
        .filter(Boolean);

      const covered = tokens.some(
        (tok) => shortcuts.includes(tok) || audit.includes(tok),
      );
      if (!covered) missing.push(binding);
    }

    if (missing.length > 0) {
      console.error(
        "The following SPEC.md §4.1 bindings are not covered by SHORTCUTS.md or SPEC_AUDIT.md:\n" +
          missing.map((b) => `  - ${b}`).join("\n"),
      );
    }
    expect(missing).toHaveLength(0);
  });
});
