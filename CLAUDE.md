# CLAUDE.md — NotesApp Development Guide

This file is the authoritative guide for Claude Code working on the NotesApp project.
Read it in full before writing any code. Re-read the relevant sections before each task.

---

## 1. Project Overview

NotesApp is a desktop note-taking application for AI-assisted research and learning,
built with Tauri v2 (Rust backend + React/TypeScript frontend). It runs as a native
desktop window — users never navigate to it in a browser.

The canonical product specification is `SPEC.md` at the repository root.
When this file and `SPEC.md` conflict, `SPEC.md` wins — flag the conflict
rather than silently resolving it.

The phased implementation plan is `ROADMAP.md`. When Claude Code is about
to implement something that appears simpler or more limited than SPEC.md
requires, check `ROADMAP.md` for an explicit phase substitution before
assuming the spec is wrong. Phase substitutions — e.g., Phase 1's read-only
Preview tile, or Phase 1's `stderr` fallback for `NOTESAPP_PROJECT_DIR`
resolution failures — are declared explicitly in `ROADMAP.md` under each
phase's "Phase N Substitutions" heading.

---

## 2. Repository Layout

```
notesapp/                        # git root — everything lives here
  CLAUDE.md                      # this file
  SPEC.md                        # product specification
  ROADMAP.md                     # phased implementation plan
  Cargo.toml                     # Rust workspace root
  Cargo.lock
  package.json                   # frontend root (Vite + React)
  package-lock.json
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
  src/                           # React/TypeScript frontend
    main.tsx
    App.tsx
    components/
    hooks/
    stores/
    styles/
  src-tauri/                     # Rust/Tauri backend
    Cargo.toml
    tauri.conf.json
    src/
      main.rs
      lib.rs
      commands/
      search/
      ai/
      fs/
  tests/
    unit/                        # Vitest frontend unit tests
    e2e/                         # WebdriverIO E2E tests
  public/
    fonts/                       # Bundled JetBrains Mono + Inter
```

The Tauri standard layout uses `src/` for the frontend and `src-tauri/` for Rust.
Follow this convention exactly — do not invent alternative layouts.

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

---

## 4. Development Environment

### 4.1 Platform Facts

- **Development VM:** x86 Ubuntu 24.04 LTS
- **Production target:** Apple Silicon macOS (M1+)
- **Display:** The VM has a display server. Use `Xvfb` for headless E2E test runs.
- **Browser tooling:** Chrome + Claude in Chrome extension are installed and available
  for visual debugging, but all automated tests must run without human observation.

### 4.2 Webview Difference — Critical

Tauri on Linux uses **WebKitGTK**. Tauri on macOS uses **WKWebView**.
They are close but not identical. Known risk areas:
- Canvas rendering (Excalidraw)
- Font rendering and subpixel antialiasing
- CSS `backdrop-filter` support

When you observe a rendering difference between Linux dev and macOS target,
document it explicitly in a `COMPAT.md` file at the repo root and flag it
to the user. Do not silently work around it without noting the divergence.

The Linux E2E suite is the project's only automated cross-webview test
layer. When a behavior cannot be faithfully exercised in WebKitGTK via
WebDriver (drag-and-drop is the canonical example — see `COMPAT.md`),
the Linux E2E test verifies the React-side wiring with synthetic events
and the actual gesture is verified manually on macOS. Mac-side E2E
infrastructure is deliberately deferred until a concrete divergence
demands it. When that happens, the right response is a single targeted
Mac E2E test for the divergent behavior — not a port of the full suite.

### 4.3 Build Commands

```bash
# Install dependencies
npm install

# Start dev server (Tauri window + hot reload)
npm run tauri dev

# Run Rust unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Run frontend unit tests (headless)
npm run test:unit

# Run E2E tests (headless, uses Xvfb)
npm run test:e2e

# Typecheck (must pass before any commit)
npm run typecheck

# Lint (must pass before any commit)
npm run lint

# Run all tests (must pass before any commit)
npm run test

# Build for production (Linux)
npm run tauri build
```

All CI checks — `npm run typecheck`, `npm run lint`, and `npm run test` —
must exit 0 before you consider any task complete. These three commands
mirror the GitHub Actions CI pipeline; if any of them fail locally, CI
will also fail. Run all three before declaring work finished.
Never ask the user to manually verify behavior that a test could verify.

### 4.4 E2E Test Infrastructure

E2E tests use Tauri's official WebDriver support + WebdriverIO.

- Tests live in `tests/e2e/`
- The test runner starts the Tauri app binary, drives it via WebDriver,
  and asserts on DOM state and Tauri command results
- Use `Xvfb-run` to run headlessly: `xvfb-run npm run test:e2e`
- `npm run test:e2e` must invoke `xvfb-run` internally so it works
  without a display environment
- Every significant user-visible behavior must have at least one E2E test
- E2E tests should be deterministic — no sleeps, use explicit waits

### 4.5 The Mac as Acceptance Environment

The macOS target is the production environment and the user's daily-driver
platform. It is **not** a second test environment for Claude Code to
maintain. Claude Code's testing responsibility ends at the Linux VM passing
all three test layers (`cargo test`, `vitest`, `wdio`).

The user exercises the built application on macOS as the actual user, and
surfaces issues — usability gaps, spec ambiguities revealed by real use,
rendering discrepancies — back to Claude Code for resolution. The Mac is
where reality intrudes on the spec. That is a feature of the workflow, not
a bug in it.

When the user reports an issue from Mac usage:

1. The user describes the issue and what they observed (screenshot, log
   excerpt, or reproduction steps as appropriate).
2. Claude Code identifies whether the issue is (a) an implementation bug,
   (b) a spec gap revealed by real use, or (c) a Linux/macOS divergence.
3. For implementation bugs, fix in code with a regression test at the
   appropriate layer.
4. For spec gaps, update `SPEC.md` first to define the desired behavior,
   then implement against the updated spec. Do not implement first and
   document later.
5. For divergences, update `COMPAT.md` with the specific behavior, the
   Linux E2E coverage strategy (synthetic event, skipped, etc.), and the
   manual macOS verification expectation.

Claude Code does not produce vague diagnoses for Mac-reported issues.
"I don't know, try restarting" is not an acceptable response — every
report gets a specific, actionable diagnosis or an explicit statement
of what additional information would be needed to produce one.

---

## 5. Testing Requirements

### 5.1 Three-Layer Test Strategy

Every feature must be covered at the appropriate layer(s):

**Layer 1 — Rust unit tests (`cargo test`)**
- All file I/O logic
- `NOTESAPP_PROJECT_DIR` resolution (SPEC.md §6.1.1) — every case A–I
- Project scaffolding (SPEC.md §6.1.1) — creates `.notesapp/`, `notes/`,
  `references/`, `attachments/`, and the first note; aborts on collision
- File watcher integration (SPEC.md §2.3) — emits expected events on
  delete and rename
- Search index (Tantivy) operations
- AI proxy / streaming logic
- Config parsing, including malformed `project.toml` (case G)
- Markdown front-matter parsing
- Layout JSON serialization including tile mode, buffer binding, and
  unresolvable (Missing) bindings
- Any pure function in the Rust backend

**Layer 2 — Vitest frontend unit tests (`npm run test:unit`)**
- React component rendering (React Testing Library)
- Zustand store logic
- Yjs CRDT bridge / markdown↔ProseMirror translation
- CodeMirror extension behavior
- Tile mode model (SPEC.md §4.0.1): split inheritance, mode-switch
  shortcuts, Editor↔Preview title-bar toggle, markdown-only Preview
  restriction, cancel-mode-switch rollback
- Buffer picker contents per mode (SPEC.md §4.0.2)
- Last-tile release of modified buffer (SPEC.md §4.0.1): Save, Discard,
  Cancel, and the consolidated app-quit dialog
- Missing-tile recovery (SPEC.md §5.5): Locate scope derivation,
  Open-a-different-buffer opens Editor picker, Continue/Cancel on
  unsaved changes
- "Insert into note" target resolution (SPEC.md §4.4)
- Utility functions and hooks

**Layer 3 — WebdriverIO E2E tests (`npm run test:e2e`)**
- App launches and renders the main window
- Each `NOTESAPP_PROJECT_DIR` resolution case produces the correct
  startup behavior
- Tile splitting (horizontal and vertical) inherits parent mode and
  buffer
- Files open in the correct tile
- Editor keystrokes appear in a Preview tile bound to the same note
- A Preview tile bound to a *different* note is unaffected by edits
  elsewhere
- Keyboard shortcuts function as specified
- Mid-session external file deletion transitions bound tiles to
  `Missing` mode via the file watcher
- Primary note pin/unpin behavior
- Layout persistence across restart
- Any workflow that crosses the Rust/frontend boundary

### 5.2 Test-First Discipline

Write tests before or alongside implementation, not after.
If a task is "implement feature X", the definition of done is:
all three test layers pass for feature X, not just that the feature appears to work.

### 5.3 Test Naming Convention

```
tests/unit/ComponentName.test.tsx
tests/unit/storeName.test.ts
src-tauri/src/module/tests.rs     (inline Rust tests)
tests/e2e/featureName.e2e.ts
```

---

## 6. Code Style

### 6.1 TypeScript

- Strict mode (`"strict": true` in tsconfig)
- No `any` — use `unknown` and narrow, or define proper types
- Prefer `interface` over `type` for object shapes
- All React components are function components with explicit prop types
- No default exports except for page-level components and Zustand stores
- File names: `PascalCase.tsx` for components, `camelCase.ts` for everything else

### 6.2 Rust

- No `unwrap()` or `expect()` on any user-facing code path — use `?` and proper error types
- No `panic!()` on any user-facing code path
- All Tauri commands return `Result<T, String>` at minimum; prefer typed error enums
- Use `thiserror` for error types
- Format with `cargo fmt` before committing
- Lint with `cargo clippy -- -D warnings` (zero warnings policy)

### 6.3 CSS / Tailwind

- Use CSS custom properties (variables) for all theme colors — never hardcode hex values in component files
- Theme tokens are defined in `src/styles/tokens.css`
- Tailwind utility classes are fine for layout and spacing
- Complex component styles use CSS modules (`.module.css`) alongside Tailwind

---

## 7. Visual Design — Non-Negotiable

The visual theme is specified precisely and must be implemented from day one.
Do not use placeholder colors or defer theming to "later."

### 7.1 Color Tokens

```css
/* src/styles/tokens.css */
:root {
  --color-accent:        #CC785C;   /* coral/terracotta — primary CTA, highlights */
  --color-accent-hover:  #B8674D;
  --color-accent-muted:  #E8C4B0;   /* light tint for backgrounds */

  --color-bg-primary:    #F5F0EB;   /* main window background */
  --color-bg-secondary:  #EDE8E2;   /* sidebar, secondary surfaces */
  --color-bg-overlay:    #FFFFFF;   /* cards, popovers */

  --color-surface-dark:  #1A1A1A;   /* dark mode base, title bars */
  --color-surface-mid:   #2C2C2C;   /* dark mode secondary */

  --color-text-primary:  #1C1917;   /* near-black */
  --color-text-secondary:#6B6560;   /* muted/secondary text */
  --color-text-disabled: #A8A29E;

  --color-border:        #D9D3CC;
  --color-border-focus:  #CC785C;   /* accent color for focused inputs */

  --color-error:         #DC2626;
  --color-warning:       #D97706;
  --color-success:       #16A34A;
}
```

### 7.2 Typography

Both fonts are bundled in `public/fonts/` and loaded via `@font-face` in `tokens.css`.
Do not rely on system font availability.

```css
--font-editor:   'JetBrains Mono', monospace;   /* editor tile */
--font-prose:    'Inter', sans-serif;            /* preview, chat, UI chrome */
--font-size-editor-default: 14px;
--font-size-prose-default:  16px;
```

### 7.3 Tile Title Bar

Every tile has a title bar containing these elements, in order, per SPEC.md §4.0:

- **Mode indicator.** Shows the tile's current mode (`Editor`, `Preview`,
  `Reference`, `AI Chat`, or `⚠ Missing`). On Editor and Preview tiles it
  is a clickable toggle that switches the tile between those two modes
  (subject to the markdown-only restriction in SPEC.md §4.0.1 — greyed
  out when the bound file is not `.md`). On Reference, AI Chat, and
  Missing tiles the indicator is a plain label, not interactive.
- **Buffer name** with a **▾ dropdown button** that opens the tile's
  buffer picker (SPEC.md §4.0.2). The buffer name is the filename for
  Editor/Preview/Reference tiles, the human-readable session name for
  AI Chat tiles. The dropdown is absent on Missing tiles — mode and
  buffer switching there are redirected to the tile's three recovery
  action buttons per SPEC.md §5.5. File names are truncated with an
  ellipsis if needed.
- **Pin/star icon** (Editor tiles only — not Preview, Reference, AI
  Chat, or Missing): ⭐ unpinned → 📌 pinned.
- **Split horizontal / split vertical** buttons.
- **Maximize / restore** button.
- **Close** button.

The title bar background is `--color-surface-dark` with
`--color-text-primary` at reduced opacity.

A dirty indicator (`•`) appears next to the buffer name when the bound
buffer has unsaved changes (Editor and Preview tiles only).

---

## 8. Key Product Decisions (resolved during spec interview)

These decisions resolve open questions or ambiguities in SPEC.md:

### 8.1 Tile Modes and Buffer Binding (SPEC.md §4.0.1)

Every tile has exactly one **mode** (`Editor`, `Preview`, `Reference`,
`AI Chat`, or `Missing`) and is bound to exactly one **buffer** at all
times. The application must never produce an unbound tile through any
user action — this is the "always bound" invariant. `Missing` is the
sole non-user-selectable mode and represents a broken binding, not an
unbound tile.

Key rules flowing from this:

- Splitting a tile (`C-x h`, `C-x v`, title-bar split buttons) produces
  two tiles that both inherit the parent's mode and bound buffer.
- Changing a tile's mode (`C-x n n`, `C-x n p`, `C-x n r`, `C-x n c`)
  immediately opens the mode-appropriate buffer picker so the user
  selects a new buffer. Canceling the picker rolls back the mode change.
- The title-bar mode indicator is a one-click toggle *only* between
  Editor and Preview (SPEC.md §4.0.1). Cross-category switches (e.g.,
  Editor → AI Chat) require the `C-x n *` keyboard shortcuts.
- Preview mode is markdown-only. The Editor↔Preview toggle is greyed
  out, and `C-x n p` is a no-op with a status-bar message, when the
  bound file's extension is not `.md`.

### 8.2 Last-Tile Release of a Modified Buffer (SPEC.md §4.0.1)

When a tile's mode changes, buffer changes, tile is closed, or window
is closed, and that tile was the *last* tile bound to a modified
buffer, the application must prompt: Save / Discard / Cancel. Cancel
aborts the release entirely. On app quit with multiple modified
buffers, a single consolidated dialog lists them with per-buffer
Save/Discard checkboxes.

Missing-tile recovery uses a simpler Continue/Cancel prompt (saving is
not meaningful when the underlying file is gone) — see SPEC.md §5.5.

### 8.3 Primary Note ("Insert into Note" target) (SPEC.md §4.4)

When the user clicks "Insert into note" in an AI Chat tile, the target is
the **primary note** — the Editor tile that is currently pinned.

- The pin is toggled with `C-x p` or by clicking the pin icon in the tile title bar.
- Only one Editor tile can be pinned at a time; pinning a new tile unpins the previous one.
- The pin icon is **only shown on Editor tiles** (not Preview, Reference, AI Chat, or Missing tiles).
- The pin state is transient — it is not persisted across sessions.
- If no tile is pinned, or the pinned tile has entered `Missing` mode,
  "Insert into note" opens a target picker listing all open Editor
  tiles (with their bound note filenames and tile numbers) so the user
  explicitly selects the destination.
- If no Editor tiles are open, the target picker offers a `+ New note…`
  option that creates a new note and a new Editor tile bound to it.

The application does **not** maintain "most recently focused Editor
tile" state — the pin mechanism and the target picker are the only
paths to "Insert into note."

### 8.4 Activity Sidebar Contents (SPEC.md §4.2)

The sidebar contains four sections (Explorer, Search, Tags, References),
each collapsible, with per-project memory of which sections are open.
Interaction model is **browse only** — clicking a file does not open it.
To load a file into a tile, use `C-x b` or drag from the sidebar onto
a tile.

The order in which these sections are implemented is specified in
`ROADMAP.md`, not here. Claude Code should check ROADMAP.md for the
current phase's sidebar deliverables rather than assuming all four
sections exist in every phase.

### 8.5 `NOTESAPP_PROJECT_DIR` Resolution (SPEC.md §6.1.1)

The env var resolves through a case-based matrix (A–I) defined in
SPEC.md §6.1.1. Broad strokes:
- Valid project directory → open it.
- Uninitialized existing directory or non-existent leaf with accessible
  parent → scaffold it as a new project.
- Inaccessible, non-directory, malformed, or read-only path → show the
  "unable to open" dialog (SPEC.md §6.1.2).

Phase 1 substitutes a `stderr` message plus directory-chooser fallback
for the "unable to open" dialog; see ROADMAP.md for that substitution.
Phase 6 implements the full dialog.

### 8.6 Tauri vs Electron

Tauri v2 is the confirmed choice. Do not revisit this.

---

## 9. Keyboard Shortcuts Reference

All shortcuts in SPEC.md §4.1 apply. The following are the most
essential for day-to-day development work on the app:

| Shortcut | Action |
|---|---|
| `C-x o` | Focus next tile |
| `C-x O` | Focus previous tile |
| `C-x h` | Split current tile horizontally (halves inherit mode/buffer) |
| `C-x v` | Split current tile vertically (halves inherit mode/buffer) |
| `C-x 0` / `C-x w` | Close current tile (with Save/Discard/Cancel on last-tile release of a modified buffer) |
| `C-x z` | Maximize / restore current tile |
| `C-x b` | Buffer switcher for the focused tile's mode (Editor picker in a Missing tile) |
| `C-x C-s` | Save current note |
| `C-x C-f` | Open note by name (in a focused Editor tile) |
| `C-x C-r` | Open reference by name (in a focused Reference tile) |
| `C-x n n` | Set current tile mode to **Editor** and open a note |
| `C-x n p` | Set current tile mode to **Preview** and open a note (no-op on non-`.md` files) |
| `C-x n r` | Set current tile mode to **Reference** and open a reference document |
| `C-x n c` | Set current tile mode to **AI Chat** and open (or create) a session |
| `C-x p` | Toggle pin on current Editor tile |
| `Cmd+B` / `Ctrl+Shift+B` | Toggle activity sidebar |
| `Ctrl/Cmd+Shift+F` | Global project search |

Note the Editor↔Preview toggle in the tile title bar is a one-click
equivalent of `C-x n n` / `C-x n p` on markdown-bound tiles.

Emacs bindings in the CodeMirror editor are implemented via
`@replit/codemirror-emacs` or equivalent. See SPEC.md §5.1 for the full list.

---

## 10. What Claude Code Must Never Do

- **Never produce an unbound tile.** Every tile has a mode and a bound
  buffer at all times (SPEC.md §4.0.1). The only mode without a
  resolved buffer is `Missing`, which the application enters
  automatically when a binding breaks — it is not a user-selectable
  state.
- **Never silently discard user text.** Autosave, crash recovery, and
  the last-tile-release Save/Discard/Cancel prompt are non-negotiable.
- **Never silently "repair" an unexpected on-disk project state.** When
  `NOTESAPP_PROJECT_DIR` points to a malformed project, a non-directory,
  or a broken `.notesapp/` structure, the application reports the
  specific problem and lets the user choose — it does not overwrite,
  migrate, or delete.
- **Never ask the user to manually test something** that a test could verify.
- **Never `unwrap()` or `panic!()` on user-facing Rust paths.**
- **Never hardcode hex colors in component files** — always use CSS variables.
- **Never leave a `TODO` without filing it as a known issue** in `ISSUES.md`.
- **Never commit with failing CI checks** — `npm run typecheck`,
  `npm run lint`, and `npm run test` must all pass.
- **Never use `any` in TypeScript.**
- **Never use system fonts** — always use bundled JetBrains Mono / Inter.
- **Never ship `cargo clippy` warnings** — zero warnings policy.
- **Never use "pane" in new code or documentation.** The canonical term
  is "tile" (SPEC.md §1.1). If you encounter "pane" in existing code or
  comments during a task, update it.

---

## 11. Communication Protocol

When you complete a task:
1. State which tests you ran and their results (paste the summary line)
2. List any new files created
3. List any SPEC.md or ROADMAP.md decisions you had to interpret (flag ambiguities)
4. List anything deferred to a later phase, with a pointer to the relevant
   ROADMAP.md phase substitution if one is in effect

When you are uncertain about a product decision, stop and ask.
Do not make assumptions about UX behavior — SPEC.md is detailed enough
that most questions are answerable from it. If SPEC.md is silent, say so
rather than inventing behavior. If your planned implementation appears
to deviate from SPEC.md, check ROADMAP.md first for an explicit phase
substitution before treating the spec as wrong.


---

## 12. Licensing and Attribution Requirements

This repository uses a dual-license model:

| Content type | License | File |
|---|---|---|
| Documentation (`.md`, `.txt`, `.rst`) | CC BY 4.0 | `LICENSE-DOCS` |
| Source code (`.rs`, `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.toml`, config `.json`) | MIT | `LICENSE-CODE` |

### 12.1 Rules for Every File You Create

**Documentation files** (any `.md` file — including notes, guides, READMEs,
changelogs, and this file):

Every markdown file must end with this exact footer, separated from the
preceding content by a blank line and a horizontal rule:

```markdown
---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
```

**Source code files** (Rust, TypeScript, JavaScript, CSS):

Every source file must begin with this SPDX header as a comment in the
appropriate comment syntax for that language, followed by a blank line:

Rust / TypeScript / JavaScript / CSS:
```
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude
```

CSS:
```css
/* SPDX-License-Identifier: MIT */
/* Copyright (c) 2026 NotesApp Contributors */
/* Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude */
```

TOML configuration files:
```toml
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 NotesApp Contributors
# Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude
```

**JSON files** (configuration, not data): JSON does not support comments.
Add a `"_license"` key at the top level of any hand-authored config file
where it would not break functionality:
```json
{
  "_license": "MIT — Copyright (c) 2026 NotesApp Contributors",
  ...
}
```
Do not add `_license` keys to data files (`layout.json`, `ai-context/*.json`,
`*.pdf.annotations`) — those are user data, not authored source.

### 12.2 What "Never Do" Means for Licensing

- **Never create a source file without the SPDX header.**
- **Never create a markdown file without the CC BY footer.**
- **Never omit the Claude attribution** — it is part of the license condition.
- **Never modify the footer or header wording** — use the exact text above.
- When modifying an existing file that lacks the header/footer, add it as
  part of your change.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
