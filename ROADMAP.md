# NotesApp — Phased Implementation Roadmap

This document defines the order in which NotesApp's features are delivered,
the substitutions used in intermediate phases where a SPEC.md behavior is
not yet fully implemented, and the entry/exit criteria for each phase.

`SPEC.md` describes the required end-state behavior of the application.
`ROADMAP.md` describes the path to get there. Where this document specifies
a temporary substitute for a spec'd behavior in an intermediate phase, the
substitution is explicit and named as such.

Each phase has a clear entry criterion, an exit criterion (all tests pass),
and a defined scope. Claude Code works one phase at a time and does not
begin the next phase until the current phase's exit criterion is met.

---

## Phase 1 — Skeleton: Editor + Preview, Tiling Layout, Theme, Missing Mode

**Goal:** A running Tauri app where a user can open a project directory,
create and edit markdown notes, see a live rendered preview in a tile with
its own independent buffer binding, and tile/split tiles freely. The tile
mode and buffer binding model from SPEC.md §4.0.1 is fully realized,
including the `Missing` recovery mode from SPEC.md §5.5. All three test
layers are established and passing.

**Entry criterion:** Fresh repository, no prior code.

### Phase 1 Substitutions of Spec'd Behavior

Phase 1 fully implements the tile / buffer / Missing-mode model from SPEC.md
§4.0.1 and §5.5. The following substitutions are explicit temporary
deviations from the spec:

- **Preview tile is read-only.** SPEC.md §5.2 describes a bidirectional
  WYSIWYG Preview via Tiptap and a Yjs bridge between `Y.Text` (markdown)
  and `Y.XmlFragment` (ProseMirror). Phase 1 implements only the rendering
  pipeline (remark/rehype/KaTeX/Mermaid), with the Preview tile bound to
  its own `.md` file via the buffer picker described in SPEC.md §4.0.2.
  The Tiptap editing layer and the `Y.Text` ↔ `Y.XmlFragment` bridge land
  in Phase 2. Each Phase 1 Preview tile still has its own independent
  buffer binding per SPEC.md §5.2 — it does not "follow" any Editor tile.
- **`NOTESAPP_PROJECT_DIR` failure handling falls back to the directory
  chooser with a `stderr` message** instead of the in-app "Unable to open
  a project at `<path>`" dialog specified in SPEC.md §6.1.2. When the env
  var resolves to cases E, F, G, H, or I (see SPEC.md §6.1.1), Phase 1
  writes a single-line message to `stderr`:

  ```
  NOTESAPP_PROJECT_DIR=<path>: <reason>; falling back to directory chooser
  ```

  and then presents the OS directory-chooser dialog, as if the env var
  had been unset. Users launching from a terminal see the `stderr` message
  directly; users launching from a GUI see only the chooser. The full
  in-app dialog replaces this fallback in Phase 6.
- **Scaffolded projects use `notes/untitled.md` as the first note**
  without prompting. SPEC.md §6.1.3 specifies that the new-project wizard
  collects the first note filename from the user. Phase 1 has no wizard,
  so scaffolding (cases C and D from SPEC.md §6.1.1, plus the directory
  chooser's result if it lands on an uninitialized directory) silently
  creates `notes/untitled.md` with the standard front-matter block and
  opens the default two-tile layout.
- **Scaffolded `notes/untitled.md` body is populated from
  `docs/MACOS_ACCEPTANCE_TESTS.md`** rather than being empty. SPEC.md
  §6.1.1 specifies an empty body; until the new-project wizard (Phase 6)
  gives the user a way to enter their own starter content, the scaffold
  instead embeds the macOS acceptance-test checklist so a fresh-project
  launch on a Mac drops the user straight into the manual-test workflow
  that Linux CI cannot cover. Reverts to the spec'd empty body when the
  wizard lands in Phase 6.
- **No sidebar Search, Tags, or References sections.** SPEC.md §4.2
  describes all four sidebar sections. Phase 1 implements only the
  Explorer section. Search lands in Phase 3, References in Phase 3,
  Tags in a later phase (see Phase 6).

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

#### Project Loading and `NOTESAPP_PROJECT_DIR` Resolution
- [x] Implement the full SPEC.md §6.1.1 resolution matrix (cases A–I)
- [x] Cases B, C, D → open or scaffold the directory; scaffolding
      creates `.notesapp/project.toml`, `notes/`, `references/`,
      `attachments/`, and `notes/untitled.md` with standard front-matter
- [x] Cases E, F, G, H, I → emit the Phase 1 `stderr` message (see
      substitution above) and present the directory chooser
- [x] Case A (env var unset) → present the directory chooser
- [x] Chooser result is processed through the same §6.1.1 resolution
      (a user who picks a broken existing project gets the stderr
      message and the chooser reopens)
- [x] Reads all `.md` files and any other text files from `notes/` and
      exposes them to the frontend via Tauri command (the Editor picker
      lists all text files per SPEC.md §4.0.2; the Preview picker lists
      only `.md` files)
- [x] Rust file watcher (`notify` crate, debounced) watching `notes/`,
      `references/`, and `.notesapp/ai-context/`, notifying the frontend
      on deletions and renames (required for mid-session `Missing` mode
      transitions per SPEC.md §5.5)

#### Tiling Layout (react-mosaic)
- [x] `MosaicWindow` wrapper component with themed title bar
- [x] Title bar shows: mode indicator, buffer name with `▾` dropdown,
      split-H button, split-V button, maximize button, close button
- [x] Mode indicator is a **toggle between Editor and Preview on
      Editor/Preview tiles only** (SPEC.md §4.0.1). On Reference, AI
      Chat, and Missing tiles it is a plain label. The toggle is
      disabled (greyed out) when the bound file is not a `.md` file.
- [x] Pin icon on Editor tiles only; `C-x p` toggles pin; only one
      tile pinned at a time
- [x] Default layout on first open: single Editor tile + single
      Preview tile, **both bound to the same first note** per SPEC.md
      §4.0.1 "Initial mode and binding at tile creation"
- [x] Split inherits parent tile's mode and bound buffer (SPEC.md
      §4.0.1 / §4.0.3)
- [x] Layout persisted to `.notesapp/layout.json` on every structural
      change (split, close, move, mode change, buffer change, resize)
- [x] Layout restored on next open; tiles whose bound buffers cannot
      be resolved open in `Missing` mode (SPEC.md §5.5)
- [x] `C-x o` cycles focus through tiles
- [x] `C-x h` / `C-x v` splits current tile
- [x] `C-x 0` closes current tile
- [x] `C-x z` maximizes / restores current tile
- [x] `C-x n n` / `C-x n p` / `C-x n r` / `C-x n c` mode-switch
      shortcuts per SPEC.md §4.0.1 (in Phase 1, `C-x n r` and
      `C-x n c` open a stub picker since Reference and AI Chat tiles
      are implemented in Phase 3 and Phase 4 — see below)
- [x] `C-x n p` is a no-op with a status-bar message when the bound
      file is not a `.md` file (SPEC.md §4.0.1)
- [x] `Cmd+B` / `Ctrl+Shift+B` toggles activity sidebar

> **Phase 1 note on `C-x n r` and `C-x n c`:** these shortcuts change the
> current tile's mode to Reference or AI Chat respectively, but the
> Reference and AI Chat tiles themselves are not implemented until
> Phase 3 and Phase 4. In Phase 1, these shortcuts open a simple
> placeholder picker that tells the user the mode is not yet available
> and returns the tile to its prior mode. This preserves the SPEC.md
> §4.0.1 invariant (every tile is bound) while deferring the underlying
> tile implementations.

#### Buffer Pickers (SPEC.md §4.0.2)
- [x] Floating fuzzy picker dialog with live-filtered text input and
      keyboard-navigable results list; first item highlighted by default
- [x] Editor picker lists all text files in `notes/` plus
      `+ New note…` at the top
- [x] Preview picker lists only `.md` files in `notes/` plus
      `+ New note…` at the top
- [x] `+ New note…` prompts for a filename; in the Editor picker,
      a non-`.md` extension creates the file verbatim; in the
      Preview picker, a non-`.md` extension is rejected with an
      inline message
- [x] Canceling a mode-switch picker rolls back the mode change
      (SPEC.md §4.0.1)
- [x] `C-x b` opens the picker for the focused tile's current mode
      (Editor picker for Editor, Preview picker for Preview, stub
      pickers for Reference/AI Chat in Phase 1)
- [x] In a Missing tile, `C-x b` opens the Editor picker (SPEC.md §4.2)
- [x] Drag a file from the Explorer sidebar onto a tile rebinds the
      tile to that file (into Editor mode if the tile was Preview and
      the file is not `.md`)

#### Activity Sidebar — Explorer Only
- [x] Collapsible sidebar, left edge of window
- [x] Explorer section: flat list of all notes sorted by modification
      time (per-project sort preference honored)
- [x] Sidebar is browse-only (clicking a file does not open it)
- [x] Drag a file from sidebar onto a tile to open it in that tile

#### Editor Tile (CodeMirror 6)
- [x] Markdown syntax highlighting (including fenced code blocks)
- [x] LaTeX inline (`$...$`) and display (`$$...$$`) highlighted as
      distinct token types
- [x] Mermaid fenced blocks highlighted
- [x] Line numbers shown
- [x] Word wrap toggle button in tile title bar
- [x] Emacs keybindings via `@replit/codemirror-emacs`:
  - `C-f/b/n/p`, `M-f/b`, `C-a/e`, `C-k`, `C-y`, `C-space`, `C-w`, `M-w`
  - `C-x C-s` (save), `C-/` (undo), `C-g` (cancel)
  - `M-<` (beginning of file), `M->` (end of file)
- [x] `C-x b` buffer switcher opens the picker over the window, as
      described above
- [x] `C-x C-f` opens a note by name (Editor picker, with "Create new
      note" option)
- [x] File saves to disk on `C-x C-s`; dirty indicator (`•`) in title
      bar when unsaved
- [x] Autosave of the Y.Doc to `<filename>.tmp` every 30 seconds
      (SPEC.md §9.1)
- [x] OS spellcheck enabled (native webview spellcheck)
- [x] Spellcheck suppressed inside fenced code blocks and LaTeX blocks
- [x] Live word + character count in status bar below editor

#### Preview Tile (Rendered Markdown, Read-Only in Phase 1)
- [x] **Each Preview tile has its own independent buffer binding**
      (SPEC.md §5.2); it does not follow any Editor tile's focus or
      pin state
- [x] Preview tile title bar shows the bound `.md` file with a `▾`
      dropdown (the Preview buffer picker)
- [x] remark/rehype pipeline: CommonMark → HTML
- [x] YAML front-matter (the `---`-delimited block at the top of a note,
      per SPEC.md §3.2) is parsed by `remark-frontmatter` and stripped
      from the rendered output — it is not rendered as text, as a
      thematic break, or as any other visible element
- [x] KaTeX: inline and display math rendered
- [x] Mermaid.js: fenced `mermaid` blocks rendered as diagrams
- [x] Debounced re-render (~150ms after any Y.Text change on the bound
      note)
- [x] When both an Editor and a Preview tile are bound to the same
      note, they are scroll-synced (best-effort) and share a single
      Y.Doc per SPEC.md §5.2
- [x] Read-only in Phase 1 — no Tiptap editing (that lands in Phase 2)

#### Yjs CRDT Document Model
- [x] Each open note is backed by a single `Y.Doc` in memory
- [x] Y.Doc is created when the first tile binds to the note, released
      when the last tile unbinds
- [x] CodeMirror binds to `Y.Text` via `y-codemirror.next`
- [x] Multiple Editor (or mixed Editor/Preview) tiles for the same note
      share the same `Y.Doc` — edits in any tile immediately appear in
      all others
- [x] `Y.Doc` serialized to `.tmp` file every 30 seconds
- [x] **Undo-to-clean:** when an undo returns Y.Doc content to byte-for-byte
      equality with the `.md` file on disk, cancel the autosave timer for
      that note, delete its `.tmp` file (if present), and clear the dirty
      indicator (SPEC.md §5.1, §9.1)

#### Last-Tile Release of a Modified Buffer (SPEC.md §4.0.1)
- [x] When a tile's mode changes, buffer changes, tile is closed, or
      window is closed, and the tile was the *last* tile bound to a
      modified buffer, show the Save / Discard / Cancel dialog
- [x] **Save** writes to the `.md` file (same as `C-x C-s`) and deletes
      the `.tmp` file
- [x] **Discard** deletes the `.tmp` file and proceeds
- [x] **Cancel** aborts the release entirely
- [x] On app quit with multiple modified buffers open, show a
      consolidated dialog listing every modified buffer with
      per-buffer Save/Discard checkboxes plus a single Cancel button
- [x] In Missing-mode tiles with unsaved changes, the simpler
      Continue/Cancel confirmation per SPEC.md §5.5 (saving is not
      offered because the underlying file is gone)

#### "Insert into note" Target Resolution (SPEC.md §4.4)
> "Insert into note" is an AI Chat tile action, so the full flow only
> exists once AI Chat tiles land in Phase 4. Phase 1 implements the
> pin mechanism itself (pin icon, `C-x p`, one-tile-pinned invariant)
> so the pin state is available when Phase 4 wires in the insert action.
- [x] Pin icon on Editor tiles; `C-x p` toggles pin; pinning a second
      Editor tile unpins the first
- [x] Pin is discarded when a pinned Editor tile enters `Missing` mode

#### Missing Tile (Recovery Mode — SPEC.md §5.5)
- [x] `Missing` is a non-user-selectable tile mode entered automatically
      when a bound buffer cannot be resolved
- [x] Entry triggers: layout restore with a missing file, file watcher
      report of deletion/rename, failed read/write on the bound buffer
- [x] Title bar shows `⚠ Missing` and the unresolvable buffer name;
      no dropdown
- [x] Tile is read-only; no autosave; no `.tmp` writes from this tile
- [x] In-memory Y.Doc of the missing note is preserved if any other
      (non-Missing) tile is still bound to it
- [x] Three buttons: **Locate…**, **Open a different buffer**,
      **Close tile** — behaviors per SPEC.md §5.5
- [x] **Locate…** scopes the OS filesystem picker by the missing file's
      recorded directory (`notes/`, `references/`, or `ai-context/`),
      derived from the broken binding itself (no "prior mode" tracking)
- [x] **Open a different buffer** opens the Editor picker (SPEC.md §5.5)
- [x] Unsaved-changes Continue/Cancel confirmation on "Open a different
      buffer" and "Close tile" when the buffer has unsaved edits
- [x] `Missing` tiles serialize in `layout.json`; resolvable bindings
      reopen normally on next launch, unresolvable ones reopen as
      `Missing`

#### Crash Recovery (SPEC.md §9.1)
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
- `NOTESAPP_PROJECT_DIR` resolution: each of cases A–I produces the
  correct classification; cases C/D scaffold correctly; cases E–I
  produce the Phase 1 `stderr` message in the expected format
- `notes/` directory scanning: Editor listing returns all text files,
  Preview listing returns only `.md` files
- `.tmp` autosave write and crash recovery detection
- `layout.json` read/write round-trip, including tile mode, buffer
  binding, and unresolvable-binding (Missing) cases
- `project.toml` parsing, including the malformed-TOML case (G)
- File watcher emits expected events on delete and rename

**Vitest frontend unit tests:**
- `MosaicWindow` title bar renders correct elements for each tile mode
  (Editor, Preview, Reference stub, AI Chat stub, Missing)
- Mode-indicator toggle is enabled on Editor/Preview tiles only, and
  disabled on non-markdown Editor tiles
- Pin icon only appears on Editor tiles; `C-x p` toggles pin;
  pinning a second tile unpins the first; entering Missing mode
  discards the pin
- Editor buffer picker lists all text files + `+ New note…`;
  Preview buffer picker lists only `.md` files + `+ New note…`
- Canceling a mode-switch picker rolls back the mode change
- `C-x b` in a Missing tile opens the Editor picker
- Markdown → HTML rendering pipeline (remark/rehype) produces correct output
- Preview rendering strips YAML front-matter: a note beginning with a
  `---`-delimited YAML block renders only the body content, with no
  front-matter text and no `<hr>` element generated from the block
- KaTeX inline and display math renders without error
- Mermaid block renders or shows error card (no crash)
- Yjs `Y.Doc` shared between two CodeMirror instances stays in sync
- Last-tile release of a modified buffer: Save writes to disk,
  Discard deletes `.tmp`, Cancel aborts the release
- Consolidated-quit dialog lists all modified buffers
- Missing tile: Locate scopes to the correct directory based on the
  broken binding; Open-a-different-buffer opens the Editor picker;
  Close tile offers Continue/Cancel confirmation on unsaved changes

**E2E tests (WebdriverIO + Xvfb):**
- App launches with `NOTESAPP_PROJECT_DIR` set to each of the nine
  resolution cases, and behaves as specified (cases A, B, C, D proceed;
  cases E–I emit stderr and show the chooser)
- Default two-tile layout (Editor + Preview, both bound to the first
  note) renders on first launch of a scaffolded project
- Typing in the Editor tile updates the Preview tile within 500ms
  (both tiles bound to the same note)
- A note containing YAML front-matter renders in the Preview tile with
  the front-matter hidden — no `title:`/`tags:`/`created:`/`modified:`
  lines and no thematic break visible at the top of the rendered output
- A Preview tile bound to a *different* note is not affected by edits
  to the Editor tile's note
- `C-x h` splits the focused tile horizontally; both halves inherit
  the parent's mode and bound buffer; both remain functional
- `C-x v` splits the focused tile vertically; same inheritance behavior
- `C-x 0` closes the focused tile; remaining tiles are unaffected;
  closing a tile bound to a modified-but-still-open buffer does not
  prompt (another tile still holds it)
- `C-x 0` on the *last* tile bound to a modified buffer triggers
  the Save/Discard/Cancel prompt; each option behaves correctly
- `C-x z` maximizes a tile; pressing again restores the layout
- `C-x b` in an Editor tile opens the Editor picker; typing filters
  the list; `Enter` binds the selected note; first-item-default means
  a lone match is accepted by Enter alone
- `C-x b` in a Preview tile opens the Preview picker, which does not
  list non-`.md` files
- Editor↔Preview title-bar toggle switches mode in place on a
  markdown-bound tile; the toggle is disabled on a `.txt`-bound
  Editor tile
- `C-x C-s` saves the current note (dirty indicator clears)
- `C-x p` pins the current Editor tile (pin icon updates); pinning a
  second tile unpins the first
- Activity sidebar toggles with `Ctrl+Shift+B`
- Explorer section lists all notes in the test project directory
- Deleting a bound note externally (via `rm`) transitions the bound
  tile(s) to `Missing` mode within 1s; Locate… rebinds successfully;
  Open a different buffer presents the Editor picker
- Restarting the app with a deleted bound note: the tile reopens in
  `Missing` mode; restoring the file and restarting reopens the tile
  normally
- Layout is persisted: relaunch the app and verify the layout is
  restored, including tile mode and bound buffer per tile

---

## Phase 2 — WYSIWYG Preview + Drawing Blocks

**Goal:** The Preview tile becomes a bidirectional WYSIWYG editor via
Tiptap + Yjs. Drawing blocks (Excalidraw) are inserted and rendered.

### Phase 2 Substitutions

- None beyond those inherited from Phase 1 (Reference tile still not
  implemented; AI Chat still not implemented).

### Deliverables
- [ ] Tiptap editor bound to `Y.XmlFragment` via `y-prosemirror`
- [ ] Yjs bridge: `Y.Text` (markdown) ↔ `Y.XmlFragment` (ProseMirror tree)
- [ ] Tiptap formatting toolbar: bold, italic, underline, strikethrough,
      inline code, H1–H4, blockquote, ordered list, unordered list,
      task list, HR, link
- [ ] Table editing (click to edit, add/remove rows and columns)
- [ ] `drawing` fenced block renders as embedded Excalidraw canvas
- [ ] Double-click drawing to enter edit mode; `Escape` exits
- [ ] Insert drawing block via `C-c d` or toolbar button
- [ ] Sidecar `.drawing` files saved alongside `.md` files
- [ ] Paste from clipboard: rich content pastes into Preview preserving
      formatting
- [ ] All Phase 1 tests continue to pass
- [ ] New tests for Tiptap↔Yjs sync, drawing block insert/render

---

## Phase 3 — Reference Tile + Full-Text Search

**Goal:** A Reference tile that browses and renders PDFs and markdown
reference documents. Full-text search across all notes and references
via Tantivy.

### Phase 3 Substitutions

- `C-x n r` stops being a no-op / placeholder and does what SPEC.md
  §4.0.1 requires: it sets the current tile to Reference mode and
  opens the Reference picker.

### Deliverables
- [ ] Reference tile mode
- [ ] PDF rendering via PDF.js (page navigation, zoom, text selection, copy)
- [ ] Markdown reference rendering (same remark/rehype pipeline, read-only)
- [ ] Fuzzy file picker for reference documents (same style as buffer switcher,
      no `+ New` option per SPEC.md §5.3)
- [ ] Drag-and-drop into Reference tile imports file into `references/`
- [ ] Text selection → right-click → "Copy" / "Highlight"
  - Copy into editor/preview: inserts as blockquote with citation footer
- [ ] PDF annotation sidecar files (`.pdf.annotations`)
- [ ] Tantivy search index (Rust backend): indexes all notes + reference text
- [ ] Activity sidebar Search section: full-text search across all files
- [ ] Activity sidebar References section: flat list of all files in
      `references/`
- [ ] `Ctrl+Shift+F` global project search
- [ ] PDF text extraction for indexing (`pdfium` or `pdf-extract`)
- [ ] All prior tests continue to pass; new tests for search and
      reference rendering, and for `Missing` mode's "Locate…" action
      correctly scoping to `references/` when the broken binding
      refers to a reference file

---

## Phase 4 — AI Chat Tile

**Goal:** A working AI Chat tile connected to the Claude API, with
project-aware tool use (search notes, read notes, list references).

### Phase 4 Substitutions

- `C-x n c` stops being a no-op / placeholder and does what SPEC.md
  §4.0.1 requires: it sets the current tile to AI Chat mode and opens
  the AI Chat session picker.

### Deliverables
- [ ] AI Chat tile mode
- [ ] Standard chat UI: scrollable message history + input at bottom
- [ ] Streaming responses (tokens appear as they arrive)
- [ ] Full markdown rendering in chat (code blocks, LaTeX, Mermaid)
- [ ] Tauri backend AI proxy: forwards to Anthropic Messages API,
      streams back
- [ ] API key stored in macOS Keychain (Rust Security framework) or
      `config.toml` fallback
- [ ] Project tools registered in every API call:
  - `search_notes(query)`, `read_note(slug)`, `search_references(query)`,
    `read_reference(filename, page_range?)`, `list_notes()`, `list_references()`
- [ ] Context usage bar: `▓▓▓░░ 62% · 124k / 200k tokens`
- [ ] 75% soft warning; 90% warning with "Summarize and continue" /
      "Archive" actions
- [ ] Session management: named sessions, persisted to
      `ai-context/<uuid>.json`
- [ ] "Include current note" toggle; "Include selection" button
- [ ] **"Insert into note" button** — wires the pin-based target
      resolution that was already laid down in Phase 1 (SPEC.md §4.4):
      if a pinned Editor tile exists, insert there with no prompt;
      otherwise open the Editor-tile target picker
- [ ] "Copy markdown" and "Copy formatted" buttons on each response
- [ ] Regenerate last response; edit previous user message
- [ ] Multiple AI Chat tiles simultaneously (separate sessions)
- [ ] Inline error display for API errors (no crash, no dialog)
- [ ] All prior tests continue to pass; new tests for AI proxy,
      streaming, tool dispatch, and the "Insert into note" target
      picker (including the case where no Editor tile is open,
      which offers `+ New note…`)

---

## Phase 5 — Advanced Editor Features

**Goal:** Complete the Editor tile feature set from SPEC.md §5.1.

### Deliverables
- [ ] Keyboard macros: `C-x (`, `C-x )`, `C-x e`, `C-u N C-x e`
- [ ] Rectangle operations: `C-x r k/y/t/o`
- [ ] Org-mode table editing: TAB/S-TAB cell nav, M-RET new row,
      M-left/right/up/down for column/row moves, auto-reformat on TAB
- [ ] Section folding: TAB on heading cycles FOLDED/CHILDREN/SUBTREE;
      S-TAB all-fold/expand
- [ ] TAB key disambiguation (heading > table > code block > indent)
- [ ] Emacs incremental search: `C-s`, `C-r`, `M-C-s`, `M-C-r`,
      `C-w` while searching
- [ ] Emacs query replace: `M-%`, `M-C-%`
- [ ] `M-y` yank-pop (kill ring)
- [ ] LanguageTool integration (optional, config.toml flag)
- [ ] Toolbar shortcuts for all markdown constructs
- [ ] Find/replace panel with regex support
- [ ] All prior tests continue to pass

---

## Phase 6 — Project Lifecycle + Settings

**Goal:** Complete project management: first-launch wizard, project
settings panel, recent projects, per-tile font size, dark mode, and
the full in-app `NOTESAPP_PROJECT_DIR` failure-handling dialog from
SPEC.md §6.1.2.

### Phase 6 Substitutions

- None. This phase removes the Phase 1 `stderr` substitution: the
  full in-app "Unable to open a project at `<path>`" dialog from
  SPEC.md §6.1.2 replaces the Phase 1 `stderr`-and-chooser behavior
  for cases E–I.

### Deliverables
- [ ] First-launch wizard (SPEC.md §6.1.3): target directory, name,
      description, API key, model, system prompt, **first note filename**
- [ ] In-app "Unable to open a project at `<path>`" dialog for cases
      E, F, G, H, I, replacing the Phase 1 `stderr` fallback
- [ ] macOS Keychain storage for API key (Rust Security framework)
- [ ] `pass` integration for API key (`config.toml`
      `api_key_source = "pass:<path>"`)
- [ ] Recent projects list (startup screen + `File → Open Recent`)
- [ ] `File → Project Settings` panel
- [ ] Per-tile font size: `Cmd+=` / `Cmd+-` / `Cmd+0`
- [ ] Dark mode and system-adaptive mode (`config.toml`)
- [ ] `File → Close Project` returns to startup screen
- [ ] Model selector in AI Chat tile
- [ ] System prompt editing (`ai-context/system-prompt.md`)
- [ ] Activity sidebar Tags section (browse notes by front-matter tag)
- [ ] `COMPAT.md` updated with any Linux/macOS rendering differences found
- [ ] All prior tests continue to pass; new tests verify the in-app
      dialog replaces the Phase 1 `stderr` behavior across all of
      cases E–I

---

## Phase 7 — Export + Polish

**Goal:** Export, PDF annotations, accessibility, performance targets.

### Deliverables
- [ ] Export note to: PDF, standalone HTML, LaTeX (`.tex`), plain markdown
- [ ] LaTeX export: drawings as `\includegraphics`, math pass-through,
      Mermaid as figures
- [ ] Copy rendered HTML to clipboard
- [ ] Full PDF annotation (highlight, note) with sidecar persistence
- [ ] Keyboard-navigable tiles (accessibility)
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

3. **No silent data loss.** Autosave, crash recovery, and the last-tile
   release prompt are always in effect from the moment Phase 1 is complete.

4. **No panics on user-facing paths.** Every Rust `Result` is handled.

5. **Theme is not optional.** The coral/terracotta color palette and bundled
   fonts apply from the first commit.

6. **Flag spec ambiguities.** If SPEC.md is silent on something, say so.
   Do not invent UX behavior. If a proposed Phase N deliverable appears
   to conflict with SPEC.md, flag it before implementing — this document
   declares phase substitutions explicitly, not silently.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
