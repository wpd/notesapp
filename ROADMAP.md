# NotesApp — Phased Implementation Roadmap

Each phase has a clear entry criterion, an exit criterion (all tests pass),
and a defined scope. Claude Code works one phase at a time and does not
begin the next phase until the current phase's exit criterion is met.

---

## Phase 1 — Skeleton: Editor + Preview, Tiling Layout, Theme

**Goal:** A running Tauri app where a user can open a project directory,
create and edit markdown notes, see a live rendered preview, and tile/split
panes freely. All three test layers are established and passing.

**Entry criterion:** Fresh repository, no prior code.

### Deliverables

#### Infrastructure
- [x] Tauri v2 project scaffold (`src/`, `src-tauri/`, `vite.config.ts`, etc.)
- [x] `package.json` with all frontend dependencies pinned
- [x] `Cargo.toml` workspace with `src-tauri/Cargo.toml`
- [x] Tailwind CSS configured with `tailwind.config.ts`
- [x] `src/styles/tokens.css` with all color and font tokens (see CLAUDE.md §7)
- [x] JetBrains Mono and Inter fonts bundled in `public/fonts/`, loaded via `@font-face`
- [x] `npm run test` script wiring: `cargo test` + `vitest run` + `xvfb-run wdio`
- [x] Vitest configured (`vitest.config.ts`)
- [x] WebdriverIO configured (`wdio.conf.ts`) with Tauri WebDriver
- [x] `Xvfb` available and `npm run test:e2e` uses `xvfb-run` automatically
- [x] ESLint + Prettier configured (TypeScript strict)
- [x] `cargo fmt` and `cargo clippy` pass cleanly

#### Project Loading
- [x] App reads `NOTESAPP_PROJECT_DIR` env var; falls back to directory-chooser dialog
- [x] Validates that the directory exists; creates `.notesapp/` scaffold if missing
  (writes `project.toml` with defaults, creates `notes/`, `references/`, `attachments/`)
- [x] Reads all `.md` files from `notes/` and exposes them to the frontend via Tauri command

#### Tiling Layout (react-mosaic)
- [x] `MosaicWindow` wrapper component with themed title bar
- [x] Title bar shows: file name, pane type badge, split-H button, split-V button,
  maximize button, close button
- [x] Pin icon on Editor tiles only; `C-x p` toggles pin; only one tile pinned at a time
- [x] Default layout on first open: single Editor tile + single Preview tile, side by side
- [x] Layout persisted to `.notesapp/layout.json` on every structural change
- [x] Layout restored on next open; missing-file tiles show `⚠ File not found` card
- [x] `C-x o` cycles focus through tiles
- [x] `C-x h` / `C-x v` splits current tile
- [x] `C-x 0` closes current tile
- [x] `C-x z` maximizes / restores current tile
- [x] `Cmd+B` / `Ctrl+Shift+B` toggles activity sidebar

#### Activity Sidebar (Explorer section only)
- [x] Collapsible sidebar, left edge of window
- [x] Explorer section: flat list of all notes sorted by modification time
- [x] Sidebar is browse-only (clicking a file does not open it)
- [x] Drag a file from sidebar onto a pane to open it in that pane

#### Editor Pane (CodeMirror 6)
- [x] Markdown syntax highlighting (including fenced code blocks)
- [x] LaTeX inline (`$...$`) and display (`$$...$$`) highlighted as distinct token types
- [x] Mermaid fenced blocks highlighted
- [x] Line numbers shown
- [ ] Word wrap toggle button in title bar *(implemented in status bar; deferred to Phase 2 — requires lifting local state to store)*
- [x] Emacs keybindings via `@replit/codemirror-emacs`:
  - `C-f/b/n/p`, `M-f/b`, `C-a/e`, `C-k`, `C-y`, `C-space`, `C-w`, `M-w`
  - `C-x C-s` (save), `C-/` (undo), `C-g` (cancel)
  - `M-<` (beginning of file), `M->` (end of file)
- [x] `C-x b` buffer switcher: floating fuzzy picker over the window,
  shows all notes, live-filtered, `Enter` loads into focused pane, `Esc` cancels
- [x] `C-x C-f` opens a note by name (same picker, with "Create new note" option)
- [x] File saves to disk on `C-x C-s`; dirty indicator (`•`) in title bar when unsaved
- [x] Autosave to `<filename>.tmp` every 30 seconds
- [x] OS spellcheck enabled (native webview spellcheck)
- [x] Spellcheck suppressed inside fenced code blocks and LaTeX blocks *(relies on browser native behavior for monospace/pre elements)*
- [x] Live word + character count in status bar below editor

#### Preview Pane (Rendered Markdown)
- [x] Renders the same note as the focused Editor tile (or the pinned tile if set)
- [x] remark/rehype pipeline: CommonMark → HTML
- [x] KaTeX: inline and display math rendered
- [x] Mermaid.js: fenced `mermaid` blocks rendered as diagrams
- [x] Debounced re-render (~150ms after editor keystroke)
- [x] Scroll-sync: editor cursor position highlighted in preview (best-effort)
- [x] Read-only in Phase 1 (Tiptap WYSIWYG editing is Phase 2)

#### Yjs CRDT Document Model
- [x] Each open note is backed by a single `Y.Doc` in memory
- [x] CodeMirror binds to `Y.Text` via `y-codemirror.next`
- [x] Multiple Editor tiles for the same note share the same `Y.Doc`
  (edits in one tile immediately appear in all others)
- [x] `Y.Doc` serialized to `.tmp` file every 30 seconds

#### Crash Recovery
- [x] On project open, check for `.tmp` files alongside `.md` files
- [x] For each `.tmp` found, show recovery dialog:
  "Unsaved changes found for `<filename>`. Recover or discard?"
- [x] Recover: open `.tmp` content in editor (user must save explicitly)
- [x] Discard: delete `.tmp` file

#### Error Handling
- [x] Each tile wrapped in a React Error Boundary
- [x] Tile-level errors show an error card, not a crash
- [x] Mermaid parse errors shown inline in preview: `[Mermaid parse error: …]`
- [x] KaTeX parse errors shown inline: `[LaTeX error: …]`
- [x] No `unwrap()` / `panic!()` on any Rust user-facing path

### Tests — Phase 1 Exit Criterion

All of the following must pass (`npm run test` exits 0):

**Rust unit tests:**
- Project directory validation and scaffold creation
- `notes/` directory scanning and file listing
- `.tmp` autosave write and crash recovery detection
- `layout.json` read/write round-trip
- `project.toml` parsing

**Vitest frontend unit tests:**
- `MosaicWindow` title bar renders correct buttons for each pane type
- Pin icon only appears on Editor tiles
- `C-x p` toggles pin; second pin removes first
- Buffer switcher filters notes by name
- Markdown → HTML rendering pipeline (remark/rehype) produces correct output
- KaTeX inline and display math renders without error
- Mermaid block renders or shows error card (no crash)
- Yjs `Y.Doc` shared between two CodeMirror instances stays in sync

**E2E tests (WebdriverIO + Xvfb):**
- App launches and displays the main window
- Default two-pane layout (Editor + Preview) renders
- Typing in the Editor pane updates the Preview pane within 500ms
- `C-x h` splits the focused pane horizontally; both tiles remain functional
- `C-x v` splits the focused pane vertically; both tiles remain functional
- `C-x 0` closes the focused pane; remaining panes are unaffected
- `C-x z` maximizes a pane; pressing again restores the layout
- `C-x b` opens the buffer switcher; typing filters the list; `Enter` loads the file
- `C-x C-s` saves the current note (dirty indicator clears)
- `C-x p` pins the current Editor tile (pin icon updates)
- Pinning a second tile unpins the first
- Activity sidebar toggles with `Ctrl+Shift+B`
- Explorer section lists all notes in the test project directory
- Layout is persisted: relaunch the app and verify the layout is restored

---

## Phase 2 — WYSIWYG Preview + Drawing Blocks

**Goal:** The Preview pane becomes a bidirectional WYSIWYG editor via Tiptap + Yjs.
Drawing blocks (Excalidraw) are inserted and rendered.

### Deliverables
- [ ] Word-wrap toggle moved from editor status bar to tile title bar *(deferred from Phase 1 — requires lifting local state to store)*
- [ ] Tiptap editor bound to `Y.XmlFragment` via `y-prosemirror`
- [ ] Yjs bridge: `Y.Text` (markdown) ↔ `Y.XmlFragment` (ProseMirror tree)
- [ ] Tiptap formatting toolbar: bold, italic, underline, strikethrough, inline code,
  H1–H4, blockquote, ordered list, unordered list, task list, HR, link
- [ ] Table editing (click to edit, add/remove rows and columns)
- [ ] `drawing` fenced block renders as embedded Excalidraw canvas
- [ ] Double-click drawing to enter edit mode; `Escape` exits
- [ ] Insert drawing block via `C-c d` or toolbar button
- [ ] Sidecar `.drawing` files saved alongside `.md` files
- [ ] Paste from clipboard: rich content pastes into Preview preserving formatting
- [ ] All Phase 1 tests continue to pass
- [ ] New tests for Tiptap↔Yjs sync, drawing block insert/render

---

## Phase 3 — Reference Pane + Full-Text Search

**Goal:** A Reference tile that browses and renders PDFs and markdown reference
documents. Full-text search across all notes and references via Tantivy.

### Deliverables
- [ ] Reference tile pane type
- [ ] PDF rendering via PDF.js (page navigation, zoom, text selection, copy)
- [ ] Markdown reference rendering (same remark/rehype pipeline, read-only)
- [ ] Fuzzy file picker for reference documents (same style as buffer switcher)
- [ ] Drag-and-drop into Reference tile imports file into `references/`
- [ ] Text selection → right-click → "Copy" / "Highlight"
  - Copy into editor/preview: inserts as blockquote with citation footer
- [ ] PDF annotation sidecar files (`.pdf.annotations`)
- [ ] Tantivy search index (Rust backend): indexes all notes + reference text
- [ ] Activity sidebar Search section: full-text search across all files
- [ ] `Ctrl+Shift+F` global project search
- [ ] PDF text extraction for indexing (`pdfium` or `pdf-extract`)
- [ ] All prior tests continue to pass; new tests for search and reference rendering

---

## Phase 4 — AI Chat Pane

**Goal:** A working AI Chat tile connected to the Claude API, with project-aware
tool use (search notes, read notes, list references).

### Deliverables
- [ ] AI Chat tile pane type
- [ ] Standard chat UI: scrollable message history + input at bottom
- [ ] Streaming responses (tokens appear as they arrive)
- [ ] Full markdown rendering in chat (code blocks, LaTeX, Mermaid)
- [ ] Tauri backend AI proxy: forwards to Anthropic Messages API, streams back
- [ ] API key stored in macOS Keychain (Rust Security framework) or `config.toml` fallback
- [ ] Project tools registered in every API call:
  - `search_notes(query)`, `read_note(slug)`, `search_references(query)`,
    `read_reference(filename, page_range?)`, `list_notes()`, `list_references()`
- [ ] Context usage bar: `▓▓▓░░ 62% · 124k / 200k tokens`
- [ ] 75% soft warning; 90% warning with "Summarize and continue" / "Archive" actions
- [ ] Session management: named sessions, persisted to `ai-context/<uuid>.json`
- [ ] "Include current note" toggle; "Include selection" button
- [ ] "Insert into note" button → inserts response into pinned/primary Editor tile
- [ ] "Copy markdown" and "Copy formatted" buttons on each response
- [ ] Regenerate last response; edit previous user message
- [ ] Multiple AI Chat tiles simultaneously (separate sessions)
- [ ] Inline error display for API errors (no crash, no dialog)
- [ ] All prior tests continue to pass; new tests for AI proxy, streaming, tool dispatch

---

## Phase 5 — Advanced Editor Features

**Goal:** Complete the Editor pane feature set from SPEC.md §5.1.

### Deliverables
- [ ] Keyboard macros: `C-x (`, `C-x )`, `C-x e`, `C-u N C-x e`
- [ ] Rectangle operations: `C-x r k/y/t/o`
- [ ] Org-mode table editing: TAB/S-TAB cell nav, M-RET new row, M-left/right/up/down
  for column/row moves, auto-reformat on TAB
- [ ] Section folding: TAB on heading cycles FOLDED/CHILDREN/SUBTREE; S-TAB all-fold/expand
- [ ] TAB key disambiguation (heading > table > code block > indent)
- [ ] Emacs incremental search: `C-s`, `C-r`, `M-C-s`, `M-C-r`, `C-w` while searching
- [ ] Emacs query replace: `M-%`, `M-C-%`
- [ ] `M-y` yank-pop (kill ring)
- [ ] LanguageTool integration (optional, config.toml flag)
- [ ] Toolbar shortcuts for all markdown constructs
- [ ] Find/replace panel with regex support
- [ ] All prior tests continue to pass

---

## Phase 6 — Project Lifecycle + Settings

**Goal:** Complete project management: first-launch wizard, project settings panel,
recent projects, per-pane font size, dark mode.

### Deliverables
- [ ] First-launch wizard (§6.1 of SPEC.md): name, description, API key, model, system prompt
- [ ] macOS Keychain storage for API key (Rust Security framework)
- [ ] `pass` integration for API key (config.toml `api_key_source = "pass:<path>"`)
- [ ] Recent projects list (startup screen + `File → Open Recent`)
- [ ] `File → Project Settings` panel
- [ ] Per-pane font size: `Cmd+=` / `Cmd+-` / `Cmd+0`
- [ ] Dark mode and system-adaptive mode (config.toml)
- [ ] `File → Close Project` returns to startup screen
- [ ] Model selector in AI Chat pane
- [ ] System prompt editing (`ai-context/system-prompt.md`)
- [ ] `COMPAT.md` updated with any Linux/macOS rendering differences found
- [ ] All prior tests continue to pass

---

## Phase 7 — Export + Polish

**Goal:** Export, PDF annotations, accessibility, performance targets.

### Deliverables
- [ ] Export note to: PDF, standalone HTML, LaTeX (`.tex`), plain markdown
- [ ] LaTeX export: drawings as `\includegraphics`, math pass-through, Mermaid as figures
- [ ] Copy rendered HTML to clipboard
- [ ] Full PDF annotation (highlight, note) with sidecar persistence
- [ ] Keyboard-navigable panes (accessibility)
- [ ] Respect OS font size and contrast settings
- [ ] Preview render latency < 200ms after keystroke (measure and enforce)
- [ ] Startup time < 3 seconds to first interactive frame (measure and enforce)
- [ ] Bundle size < 50MB (Tauri target — verify on macOS build)
- [ ] macOS app bundle packaging and signing (ad-hoc for local use)
- [ ] All prior tests continue to pass

---

## Guiding Principles for All Phases

1. **Tests first.** Write or update tests before or alongside implementation.
   `npm run test` must pass at the end of every task, not just every phase.

2. **Never ask the user to test manually.** If you need to verify behavior,
   write a test that verifies it.

3. **No silent data loss.** Autosave and crash recovery are always in effect
   from the moment Phase 1 is complete.

4. **No panics on user-facing paths.** Every Rust `Result` is handled.

5. **Theme is not optional.** The coral/terracotta color palette and bundled
   fonts apply from the first commit.

6. **Flag spec ambiguities.** If SPEC.md is silent on something, say so.
   Do not invent UX behavior.


---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*