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

# Run all tests (must pass before any commit)
npm run test

# Build for production (Linux)
npm run tauri build
```

`npm run test` must exit 0 before you consider any task complete.
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

---

## 5. Testing Requirements

### 5.1 Three-Layer Test Strategy

Every feature must be covered at the appropriate layer(s):

**Layer 1 — Rust unit tests (`cargo test`)**
- All file I/O logic
- Search index (Tantivy) operations
- AI proxy / streaming logic
- Config parsing
- Markdown front-matter parsing
- Any pure function in the Rust backend

**Layer 2 — Vitest frontend unit tests (`npm run test:unit`)**
- React component rendering (React Testing Library)
- Zustand store logic
- Yjs CRDT bridge / markdown↔ProseMirror translation
- CodeMirror extension behavior
- Utility functions and hooks

**Layer 3 — WebdriverIO E2E tests (`npm run test:e2e`)**
- App launches and renders the main window
- Pane splitting (horizontal and vertical) works correctly
- Files open in the correct pane
- Editor keystrokes appear in the preview pane
- Keyboard shortcuts function as specified
- Primary note pin/unpin behavior
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
--font-editor:   'JetBrains Mono', monospace;   /* editor pane */
--font-prose:    'Inter', sans-serif;            /* preview, chat, UI chrome */
--font-size-editor-default: 14px;
--font-size-prose-default:  16px;
```

### 7.3 Tile Title Bar

Each tile has a title bar with:
- File name (truncated with ellipsis if needed)
- Pane type badge (subtle, muted text)
- Pin/star icon (⭐ unpinned → 📌 pinned) — only visible on Editor tiles
- Split horizontal / split vertical buttons
- Maximize / restore button
- Close button

The title bar background is `--color-surface-dark` with `--color-text-primary` at reduced opacity.

---

## 8. Key Product Decisions (resolved during spec interview)

These decisions resolve open questions or ambiguities in SPEC.md:

### 8.1 Primary Note ("Insert into Note" target)

When the user clicks "Insert into note" in the AI Chat pane, the target is the
**primary note** — the Editor tile that is currently pinned.

- The pin is toggled with `C-x p` or by clicking the pin icon in the tile title bar
- Only one Editor tile can be pinned at a time; pinning a new tile unpins the previous one
- If no tile is pinned, "Insert into note" targets the most recently focused Editor tile
- The pin icon is **only shown on Editor tiles** (not Preview, Reference, or AI Chat tiles)
- The pin state is transient — it is not persisted across sessions

### 8.2 Activity Sidebar — Skeleton Scope

Phase 1 implements only the **Explorer section** of the activity sidebar:
a flat list of all notes in `notes/`, sorted by modification time.
Search, Tags, and References sections are added in later phases.

Interaction model: the sidebar is **browse only**. Clicking a file does not open it.
To load a file into a pane, use `C-x b` (buffer switcher) or drag from sidebar to pane.

### 8.3 Project Directory — Skeleton Scope

Phase 1 does not implement the full first-launch wizard. Instead:
- The app reads `NOTESAPP_PROJECT_DIR` environment variable if set
- Falls back to a simple directory-chooser dialog on startup
- The full wizard (§6.1 of SPEC.md) is implemented in a later phase

### 8.4 Tauri vs Electron

Tauri v2 is the confirmed choice. Do not revisit this.

---

## 9. Keyboard Shortcuts Reference (subset for Phase 1)

All shortcuts in SPEC.md §4.1 apply. The following are essential for Phase 1:

| Shortcut | Action |
|---|---|
| `C-x o` | Focus next pane |
| `C-x h` | Split current pane horizontally |
| `C-x v` | Split current pane vertically |
| `C-x 0` | Close current pane |
| `C-x z` | Maximize / restore current pane |
| `C-x b` | Buffer switcher (open file in focused pane) |
| `C-x C-s` | Save current note |
| `C-x C-f` | Open note by name |
| `C-x p` | Toggle pin on current Editor tile |
| `Cmd+B` / `Ctrl+Shift+B` | Toggle activity sidebar |

Emacs bindings in the CodeMirror editor are implemented via
`@replit/codemirror-emacs` or equivalent. See SPEC.md §5.1 for the full list.

---

## 10. What Claude Code Must Never Do

- **Never ask the user to manually test something** that a test could verify
- **Never `unwrap()` or `panic!()` on user-facing Rust paths**
- **Never hardcode hex colors in component files** — always use CSS variables
- **Never silently discard user text** — autosave and crash recovery are non-negotiable
- **Never leave a `TODO` without filing it as a known issue** in `ISSUES.md`
- **Never commit with failing tests** — `npm run test` must pass
- **Never use `any` in TypeScript**
- **Never use system fonts** — always use bundled JetBrains Mono / Inter
- **Never use `cargo clippy` warnings** — zero warnings policy

---

## 11. Communication Protocol

When you complete a task:
1. State which tests you ran and their results (paste the summary line)
2. List any new files created
3. List any SPEC.md decisions you had to interpret (flag ambiguities)
4. List anything deferred to a later phase

When you are uncertain about a product decision, stop and ask.
Do not make assumptions about UX behavior — the spec is detailed enough
that most questions are answerable from it. If the spec is silent, say so.


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