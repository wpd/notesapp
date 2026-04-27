# CLAUDE.md — NotesApp Development Guide

Always-on context for Claude Code working on NotesApp. Keep it concise —
every line ships into every session. Detailed material lives in `docs/`
and is read on demand.

---

## 1. Project Overview

NotesApp is a desktop note-taking application for AI-assisted research
and learning, built with **Tauri v2** (Rust backend + React/TypeScript
frontend). It runs as a native desktop window — users never navigate to
it in a browser.

**Document precedence** (higher wins on conflict):

1. `SPEC.md` — canonical product specification.
2. `ROADMAP.md` — phased implementation plan. Check here for an explicit
   "Phase N Substitutions" section before assuming SPEC.md is wrong about
   something that looks too ambitious for the current phase.
3. This file — process and style rules.

When SPEC.md and this file conflict, SPEC.md wins — flag it rather than
silently resolving.

---

## 2. Repository Map

Standard Tauri v2 layout. Do not invent alternatives.

- `src/` — React/TypeScript frontend (Vite + React 18)
- `src-tauri/` — Rust/Tauri backend (`commands/`, `search/`, `ai/`, `fs/`)
- `tests/unit/` — Vitest frontend unit tests
- `tests/e2e/` — WebdriverIO E2E tests
- `public/fonts/` — bundled JetBrains Mono + Inter
- `docs/` — secondary documentation (testing, design, shortcuts, platform notes, spec interpretations)
- Root: `SPEC.md`, `ROADMAP.md`, `CLAUDE.md`, `README.md`, `COMPAT.md`,
  `DEV_ENVIRONMENT.md`, `LICENSE-CODE`, `LICENSE-DOCS`, `Cargo.toml`,
  `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`

---

## 3. Tech Stack — Locked Decisions

Do not substitute these without an explicit instruction from the user.

| Concern | Choice |
|---|---|
| Desktop framework | Tauri v2 |
| Frontend language | TypeScript (strict mode) |
| UI framework | React 18 |
| Tiling layout | react-mosaic |
| Markdown editor | CodeMirror 6 |
| Markdown rendering | unified / remark / rehype |
| LaTeX | KaTeX |
| Diagrams | Mermaid.js |
| WYSIWYG editing | Tiptap (ProseMirror) |
| CRDT / sync | Yjs (`y-codemirror.next`, `y-prosemirror`) |
| Drawing | Excalidraw |
| PDF rendering | PDF.js |
| State management | Zustand |
| Styling | Tailwind CSS |
| Search (Rust) | Tantivy |
| Build tool | Vite |
| Frontend tests | Vitest |
| E2E tests | WebdriverIO + Tauri WebDriver |
| File watcher (Rust) | `notify` crate (debounced) |
| Fonts | JetBrains Mono (editor), Inter (prose/chat) — bundled in `public/fonts/` |

Tauri v2 vs Electron is settled. Do not revisit.

---

## 4. Build & Test Commands

```bash
npm install                                       # install dependencies
npm run tauri dev                                 # dev window with hot reload
npm run tauri build                               # production build (Linux)

cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
npm run test:unit                                 # Vitest frontend unit tests
npm run test:e2e                                  # Rebuilds release binary first, then WebdriverIO E2E. No-op rebuild ~10-25s. Do not invoke wdio directly.

npm run typecheck                                 # must pass before commit (runs tsc -b, not tsc --noEmit — checks all referenced projects including tsconfig.node.json and tsconfig.wdio.json)
npm run lint                                      # must pass before commit
npm run test                                      # must pass before commit (mirrors CI)
```

`npm run typecheck`, `npm run lint`, and `npm run test` mirror GitHub
Actions CI. All three must exit 0 before a task is done. Never ask the
user to manually verify behavior that a test could verify.

- Testing strategy, layer responsibilities, naming: [`docs/TESTING.md`](docs/TESTING.md)
- Linux-dev / macOS-prod split, WebKitGTK ↔ WKWebView policy,
  user-as-acceptance-tester workflow, **and the macOS-resident agent
  workflow for issues that don't reproduce on Linux**:
  [`docs/PLATFORM.md`](docs/PLATFORM.md)
- Environment provisioning: `DEV_ENVIRONMENT.md` (repo root)

---

## 5. Code Style

### TypeScript

- Strict mode (`"strict": true`). No `any` — use `unknown` and narrow,
  or define proper types.
- Prefer `interface` over `type` for object shapes.
- React components are function components with explicit prop types.
- No default exports except page-level components and Zustand stores.
- File names: `PascalCase.tsx` for components, `camelCase.ts` otherwise.

### Rust

- No `unwrap()`, `expect()`, or `panic!()` on user-facing code paths —
  use `?` with proper error types (`thiserror`).
- All Tauri commands return `Result<T, String>` at minimum; prefer typed
  error enums.
- `cargo fmt` before commit. `cargo clippy -- -D warnings` (zero
  warnings policy).

### CSS / Tailwind

- All theme colors come from CSS custom properties defined in
  `src/styles/tokens.css`. Never hardcode hex values in component files.
- Tailwind utility classes for layout and spacing.
- Complex component styles use CSS modules (`.module.css`) alongside
  Tailwind.
- Visual design tokens (colors, typography, title-bar spec):
  [`docs/DESIGN.md`](docs/DESIGN.md). The CSS file is the source of
  truth.

---

## 6. What Claude Code Must Never Do

These are the non-negotiables. Style rules from §5 still apply on top of
this list.

- **Never produce an unbound tile.** Every tile has a mode and a bound
  buffer at all times (SPEC.md §4.0.1). `Missing` is the sole
  non-user-selectable mode and represents a broken binding — not an
  unbound tile.
- **Never silently discard user text.** Autosave, crash recovery, and
  the last-tile-release Save/Discard/Cancel prompt are non-negotiable.
- **Never silently "repair" an unexpected on-disk project state.** When
  `NOTESAPP_PROJECT_DIR` points to a malformed project, a non-directory,
  or a broken `.notesapp/` structure, report the specific problem and
  let the user choose — do not overwrite, migrate, or delete.
- **Never ask the user to manually test something** that a test could
  verify. The exception is macOS behavior that is genuinely outside the
  DOM and outside WebDriver's reach (spell-check squiggles, native
  scrollbars, real Finder drag gestures, Keychain prompts) — these
  belong in `MACOS_ACCEPTANCE_TESTS.md` with a precise checklist entry.
  See `docs/PLATFORM.md` §4.3 for the layer-selection rules.
- **Never use system fonts** — always use bundled JetBrains Mono / Inter.
- **Never leave a `TODO` without filing it as a known issue** in
  `ISSUES.md`.
- **Never commit with failing CI checks** (`npm run typecheck`,
  `npm run lint`, `npm run test` must all pass).
- **Never use "pane" in new code or documentation.** The canonical term
  is "tile" (SPEC.md §1.1). Update any "pane" you encounter.

---

## 7. Communication Protocol

When you complete a task:

1. State which tests you ran and their results (paste the summary line).
2. List any new files created.
3. Flag any SPEC.md or ROADMAP.md decisions you had to interpret.
4. List anything deferred, with a pointer to the relevant ROADMAP.md
   phase substitution if one applies.

When uncertain about a product decision, **stop and ask** — do not
invent UX behavior. If SPEC.md is silent, say so. If your planned
implementation appears to deviate from SPEC.md, check ROADMAP.md first
for a phase substitution.

- Resolved spec ambiguities (tile/buffer binding, last-tile release,
  primary-note pinning, sidebar interaction, env var resolution):
  [`docs/SPEC_NOTES.md`](docs/SPEC_NOTES.md)
- Keyboard shortcut quick reference:
  [`docs/SHORTCUTS.md`](docs/SHORTCUTS.md). Full list: SPEC.md §4.1.

---

## 8. Licensing and Attribution Requirements

Dual license:

| Content type | License | File |
|---|---|---|
| Documentation (`.md`, `.txt`, `.rst`) | CC BY 4.0 | `LICENSE-DOCS` |
| Source code (`.rs`, `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.toml`, config `.json`) | MIT | `LICENSE-CODE` |

### 8.1 Required Headers and Footers

Every **markdown file** ends with this exact footer (blank line, then
horizontal rule, then the line):

```markdown
---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
```

Every **source file** begins with the SPDX header below, followed by a
blank line. Use the comment syntax appropriate for the language: `//`
for Rust/TS/JS, `/* … */` for CSS, `#` for TOML.

```
SPDX-License-Identifier: MIT
Copyright (c) 2026 NotesApp Contributors
Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude
```

Hand-authored **JSON config files** (not data) get a `"_license"` key
at the top level:

```json
{ "_license": "MIT — Copyright (c) 2026 NotesApp Contributors", "...": "..." }
```

Do **not** add `_license` keys to data files (`layout.json`,
`ai-context/*.json`, `*.pdf.annotations`) — those are user data.

### 8.2 Licensing Never-Do

- **Never create a source file without the SPDX header.**
- **Never create a markdown file without the CC BY footer.**
- **Never omit the Claude attribution** — it is part of the license
  condition.
- **Never modify the footer or header wording** — use the exact text
  above.
- When modifying an existing file that lacks the header/footer, add it
  as part of your change.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
