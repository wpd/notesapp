# NotesApp — Product Specification

## 1. Overview

A local-first desktop note-taking application for macOS, designed for **AI-assisted research and learning**. The user augments AI-generated content with reference material obtained elsewhere (PDFs, markdown documents) and their own thinking. The application supports rich markdown authoring (with LaTeX equations and Mermaid diagrams), real-time rendered preview with inline WYSIWYG editing and drawing tools, a reference document library (PDF and markdown), and one or more chat panels connected to an AI backend (initially Claude).

All data — notes, reference documents, and AI conversation context — is stored in a **project data directory** on the local filesystem, entirely separate from the application installation. No cloud sync is required or assumed. Notes files are plain text and are intended to be managed in a git repository by the user outside this application.

The application UI is a **native desktop window** powered by an embedded webview (Tauri). It is not accessed through a web browser.

---

## 2. Application Architecture

### 2.1 Platform

- **Target platform:** macOS (primary), with Linux/Windows portability desirable
- **Recommended framework:** [Tauri v2](https://tauri.app/) (Rust backend + web frontend)
  - Lighter than Electron; native OS integration; strong file-system access via Rust
  - The webview is embedded in a native window — users never navigate to a URL in their browser
  - Alternative: Electron if Tauri imposes too many constraints on canvas/drawing libraries

### 2.2 Frontend Stack

| Concern | Library |
|---|---|
| UI framework | React (with TypeScript) |
| Layout / pane splitting | [react-mosaic](https://github.com/nomcopter/react-mosaic) — arbitrary tiling layout (see §4) |
| Markdown editor | [CodeMirror 6](https://codemirror.net/) with markdown language support |
| Markdown rendering | [unified](https://unifiedjs.com/) / remark / rehype pipeline |
| LaTeX rendering | [KaTeX](https://katex.org/) (fast, offline) |
| Diagram rendering | [Mermaid.js](https://mermaid.js.org/) |
| WYSIWYG rich-text editing | [Tiptap](https://tiptap.dev/) (ProseMirror-based; supports markdown, bold/italic/lists) |
| Shared document model (CRDT) | [Yjs](https://yjs.dev/) with `y-codemirror.next` and `y-prosemirror` bindings |
| Drawing / annotation | [Excalidraw](https://excalidraw.com/) embedded as a React component |
| PDF rendering | [PDF.js](https://mozilla.github.io/pdf.js/) |
| State management | Zustand |
| Styling | Tailwind CSS |

### 2.3 Backend (Rust / Tauri)

- File I/O: read/write notes, references, attachments, AI context files
- AI proxy: forward requests to Claude API (or other backends); manage API keys from local config; stream responses back to frontend
- **Project-wide search and retrieval:** full-text search over all notes and reference documents in the project, exposed as a tool that the AI backend can call (see §7.2)
- PDF text extraction for indexing (using `pdf-extract` or `pdfium`)
- Search engine: [Tantivy](https://github.com/quickwit-oss/tantivy) embedded in Rust for fast local full-text search

---

## 3. Data Model and Storage

### 3.1 Directory Layout

The application is launched with a project directory as its working context. The project directory *is* the project — there is no separate "data root" containing multiple projects. Each running instance of the application owns exactly one directory.

```
<project-dir>/                     # the directory the application was launched in
  .notesapp/                       # app state — can be .gitignored if desired
    project.toml                   # project metadata (name, description, active AI backend)
    layout.json                    # last window layout (mosaic tree + open file per tile)
    search-index/                  # Tantivy full-text index (regenerated on demand)
    ai-context/
      <session-id>.json            # full conversation history per AI session
      system-prompt.md             # optional per-project system prompt for AI
  notes/
    <filename>.md                  # markdown notes — named by the user
    <filename>.NNNN.drawing        # sidecar Excalidraw JSON, zero or more per note
  references/
    <filename>.pdf                 # reference PDFs
    <filename>.md                  # reference markdown documents
    <filename>.pdf.annotations     # sidecar JSON for PDF annotations
  attachments/
    <filename>                     # images and data files embedded in notes

~/.config/notesapp/config.toml    # global config: API keys, theme, font, recent projects
```

**Launching:** the application is invoked with a path: `notesapp /path/to/project-dir`, or by opening the app and using the "Open Recent" / "Open..." menu. The macOS app bundle can be set as the default handler for `.notesapp` directory bookmarks, or simply launched via the terminal or Finder.

**Notes on git compatibility:** The `notes/` and `references/` directories contain only plain text or binary files with no proprietary lock-in. The user is expected to manage these in a git repository. The `ai-context/` directory contains JSON files that are also git-friendly, giving a recoverable history of AI conversations.

### 3.2 Note Format

Each `.md` file is standard CommonMark with YAML front-matter:

````markdown
---
title: "My Note"
created: 2026-03-27T10:00:00Z
modified: 2026-03-27T12:00:00Z
tags: [physics, draft]
---

# My Note

Inline LaTeX: $E = mc^2$

Display LaTeX:
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

```mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Result]
```

A drawing block (between paragraphs):

```drawing
my-diagram.NNNN.drawing
```
````

### 3.3 AI Context Format

Conversation history stored as JSON (Claude Messages API format) per session, scoped to a project. Includes:
- Full message history (user + assistant turns)
- Model identifier
- System prompt reference
- Timestamp of last interaction

---

## 4. UI Layout

### 4.0 Tiling Layout Engine

The main window uses **[react-mosaic](https://github.com/nomcopter/react-mosaic)** to provide a fully flexible tiling layout. The layout is modeled as a binary tree:

- Each **leaf node** is a pane (editor, preview, reference viewer, AI chat, etc.)
- Each **internal node** is a split — either horizontal (side by side) or vertical (stacked)
- Any pane can be split further into two by dragging its title bar or using a keyboard shortcut

This means there is no hardcoded grid. The default layout on first launch is a suggestion; the user can rearrange freely. Example alternative layouts:

```
Default (3-column + bottom AI bar):

  [ Editor ] [ Preview ] [ Reference ]
  [        AI Chat (full width)       ]

2×2 research layout:

  [ AI Session 1 ] [ Editor         ]
  [ AI Session 2 ] [ Preview / Note ]

Reference-heavy layout:

  [ Editor ] [ Reference (PDF) ] [ Reference (PDF) ]
  [ Preview                    ] [ AI Chat          ]
```

Each pane has a title bar showing its type and (for notes) the filename. The title bar has:
- A **close** button (removes the tile; its content is not deleted)
- A **split horizontal / split vertical** button to divide the tile in two
- A **maximize** button to temporarily expand the tile to full window (click again to restore)

**Pane types** that can be placed in any tile:
- `Editor` — markdown source for a specific note (identified by filename in title bar)
- `Preview` — rendered view of a specific note (can be a different note than the open Editor)
- `Reference` — PDF or markdown reference document viewer
- `AI Chat` — an AI chat session

Multiple tiles of the same type can be open simultaneously. This includes multiple Editor or Preview tiles for the **same note** — analogous to Emacs split windows on the same buffer. Because all Editor tiles for the same note share a single Yjs document (see §5.2), edits in any tile immediately appear in all others.

**One project per application instance.** Launch additional instances for additional projects.

**Layout persistence:** `.notesapp/layout.json` is written immediately whenever the user makes a structural layout change (splitting a tile, closing a tile, moving a tile, or resizing a split boundary). Maximize/unmaximize is a transient view state and does not trigger a save. On next open, the layout is restored exactly. If a file referenced by a tile has been renamed or deleted outside the application, that tile displays a `⚠ File not found: <filename>` message with an option to locate the file or close the tile.

**Scroll position persistence:** on clean exit (normal quit, not crash), the scroll position of each tile is written into `layout.json` alongside the layout tree. On restore, each tile is scrolled to its saved position after the content loads. Scroll positions are not saved on crash — the tile reopens at the top.

### 4.1 Pane and Layout Keyboard Shortcuts

All pane operations are available via keyboard. Suggested default bindings (user-configurable):

| Action | Default Shortcut |
|---|---|
| Focus next pane (cycle) | `C-x o` (Emacs-style) |
| Focus previous pane | `C-x O` |
| Split current pane horizontally | `C-x 2` |
| Split current pane vertically | `C-x 3` |
| Close current pane tile | `C-x 0` or `C-x w` |
| Maximize / restore current pane | `C-x z` |
| Switch buffer in focused pane | `C-x b` |
| Open note in new tile | `C-x 4 f` |
| Open reference in new tile | `C-x 4 r` |
| Open new AI chat tile | `C-x 4 a` |
| Save current note | `C-x C-s` |
| Open note by name | `C-x C-f` |
| Open reference by name | `C-x C-r` |
| Toggle activity sidebar | `Cmd+B` |
| Global project search | `Cmd+Shift+F` |
| Focus pane N (1–9) | `Ctrl+N` |
| Increase font size in markup panes; increase zoom in PDF panes | `Cmd+=` |
| Decrease font size in markup panes; decrease zoom in PDF panes | `Cmd+-` |
| Reset font size (focused pane) | `Cmd+0` |

The `C-x` prefix family is intentionally consistent with Emacs window/buffer commands. `Cmd+` shortcuts follow macOS conventions and are available even when focus is outside the editor.

**Pane numbering for `Ctrl+N`:** tiles are numbered 1–9 in reading order (left to right, top to bottom) based on the current layout. A small number badge is shown in each tile's title bar while `Ctrl` is held, so the user can see which number corresponds to which tile before releasing the key.

### 4.2 Activity Sidebar

A collapsible sidebar on the left edge of the window (toggled with `Cmd+B`, modeled on VS Code) provides:

- **Explorer** — flat list of all notes in the project, sorted by modification time (or alphabetically; user-configurable). The sidebar is for browsing only — clicking a note does not open it. To load a file into a pane, use `C-x b` (buffer switcher) or drag a file from the sidebar onto any pane.
- **Search** — full-text search across all notes and references (see §5.5). Results grouped by file with surrounding context lines, like VS Code's global search.
- **Tags** — browse notes by front-matter tag.
- **References** — flat list of all files in `references/`. Same interaction model as Explorer: browse only; use `C-x b` or drag-and-drop to load into a pane.

**Buffer switcher (`C-x b`):** pressing `C-x b` opens a floating picker over the window (modeled on Emacs `switch-to-buffer`). The picker shows all notes and reference documents in the project, with a live-filtered text input at the top. Typing filters by filename and title. Arrow keys navigate the list; `Enter` loads the selected file into the focused pane, replacing its current content; `Escape` cancels. When an AI chat phase is implemented, open AI sessions will also appear in this list. If no pane is focused when `C-x b` is invoked, the picker opens but `Enter` does nothing until a pane has been focused.

Each section in the sidebar is collapsible. The sidebar remembers which sections are open/closed per project.

### 4.3 Visual Theme and Fonts

**Colors:** The default color scheme is modeled on the **Claude web client**: dark background, warm off-white text, muted sidebar surfaces, and the characteristic salmon/amber accent color used for AI response content. Light mode and system-adaptive mode are also available via `config.toml`.

**Fonts:**
- **Editor pane:** monospaced font. Default: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (clean, designed for code, includes good ligature support); falls back to `monospace` system font.
- **Preview / rendered content:** [Inter](https://rsms.me/inter/) for body text (current UX best practice for on-screen reading); falls back to the system UI font (`-apple-system`). Code blocks within rendered content use the same monospace as the editor.
- **AI chat pane:** same as Preview (Inter / system UI).
- **Font sizes:** `Cmd+=` / `Cmd+-` / `Cmd+0` adjust the font size of the **currently focused pane** only. Each pane independently tracks its current font size, starting from the project defaults defined in `project.toml`. When a project is opened, all panes start at the default sizes; per-pane size adjustments are not persisted across sessions.

---

## 5. Pane Specifications

### 5.1 Editor Pane (Source)

**Purpose:** Raw markdown authoring with a rich Emacs-like editing experience.

**Core features:**
- Syntax highlighting for Markdown, LaTeX (`$...$` / `$$...$$`), and Mermaid fenced code blocks
- Line numbers, word wrap toggle
- Auto-closing brackets and delimiters
- Toolbar shortcuts for common markdown constructs (bold, italic, heading, link, image, table, code block, LaTeX block, Mermaid block)
- Find/replace with regex support
- Live word and character count
- Scroll-sync with Preview Pane (cursor position in editor highlights corresponding position in preview)

**Emacs keybindings (required, not optional):**

The editor must implement Emacs keybindings via CodeMirror 6's `@codemirror/lang-markdown` and `@replit/codemirror-emacs` (or equivalent). The following Emacs behaviors are specifically required:

- **Standard motion and editing:** `C-f/b/n/p`, `M-f/b`, `C-a/e`, `C-k` (kill to end of line), `C-y` (yank), `M-y` (yank-pop from kill ring), `C-space` (set mark), `C-w` (kill region), `M-w` (copy region), `C-x C-s` (save), `C-x C-f` (open file), `C-/` or `C-_` (undo), `C-g` (cancel), `M-<` (beginning of file, also `Esc`, `<`), `M->` (end of file, also `Esc`, `>`) 
- **Keyboard macros:** `C-x (` to start recording, `C-x )` to stop, `C-x e` to execute most recent macro, `C-u N C-x e` to execute N times
- **Rectangle operations:** `C-x r k` (kill rectangle), `C-x r y` (yank rectangle), `C-x r t` (string-replace rectangle), `C-x r o` (open rectangle / insert spaces). These are essential for manipulating columns of ASCII text.
- **Org-mode table editing:** When the cursor is inside a markdown table, `TAB` advances to the next cell (creating a new row at end of table), `S-TAB` moves to the previous cell, `M-RET` inserts a new row, `M-left/right` moves columns, `M-up/down` moves rows. The table is automatically reformatted (column widths aligned) on each `TAB`.
- **Section folding (Org-mode style):** Pressing `TAB` on a markdown heading line cycles through three states for that section: **FOLDED** (only the heading is visible), **CHILDREN** (heading + immediate child headings), **SUBTREE** (fully expanded). `S-TAB` cycles the entire document between all-folded and all-expanded. A small indicator (▶/▼) on each heading line shows fold state.

**TAB key disambiguation — priority rules (evaluated in order):**

1. **Cursor is on a heading line** (the line begins with one or more `#` characters): TAB cycles the fold state of that heading's section. No text is inserted.
2. **Cursor is inside a table** (any line of the table, including the separator row): TAB advances to the next cell, reformats the table, and creates a new row if needed. No text is inserted.
3. **Cursor is in a fenced code block** (between ` ``` ` fences): TAB inserts a literal tab character (standard code indentation behavior).
4. **All other contexts:** TAB inserts spaces to indent the current line to the next stop, matching the indentation level of the previous non-blank line. Default indent width: 4 spaces (configurable).

**Spellcheck and writing assistance:**
- The OS/webview native spellcheck is enabled by default in the editor (red underlines on misspelled words; right-click for OS suggestions).
- Optionally, [LanguageTool](https://languagetool.org/) can be run as a local background process (no cloud) for grammar and style suggestions beyond spelling. Enabled in `config.toml`; the app checks at startup whether `languagetool-server` is available on `$PATH`.
- Spellcheck is suppressed inside fenced code blocks, LaTeX blocks, and Mermaid blocks.

### 5.2 Preview Pane (Rendered)

**Purpose:** Real-time rendered output with seamlessly bidirectional WYSIWYG editing.

**Rendering pipeline:**
- Markdown → HTML (remark/rehype)
- LaTeX → rendered math (KaTeX, both inline and display)
- Mermaid code blocks → rendered diagrams (Mermaid.js)
- Updates on each keystroke in Editor Pane (debounced ~150ms)
- The editor and preview are scroll-synced

**WYSIWYG editing (Tiptap layer) — seamlessly bidirectional via Yjs CRDT:**

Each open note is backed by a single **[Yjs](https://yjs.dev/) CRDT document** held in memory. Multiple Editor or Preview tiles for the same note all share this document, so edits in any tile immediately appear in all others with no polling or round-trip serialization.

The two editors bind to the Yjs document differently and require a translation layer:
- **CodeMirror 6** (Editor Pane) binds via `y-codemirror.next` to a `Y.Text` — a flat string representation (markdown source)
- **Tiptap/ProseMirror** (Preview Pane) binds via `y-prosemirror` to a `Y.XmlFragment` — a rich node tree

These are different Yjs types and cannot be shared directly. The implementation must maintain a **bridge** that translates between them: markdown text ↔ ProseMirror node tree, applied as incremental CRDT updates rather than full re-parses. The recommended approach is to treat `Y.Text` (markdown) as the single source of truth and derive the `Y.XmlFragment` from it via the remark/rehype parse pipeline, applied on each Yjs text-change event. Edits originating in Tiptap are serialized back to markdown (via Tiptap's markdown serializer) and written into the `Y.Text`. This is architecturally equivalent to a debounced round-trip for Tiptap-originated edits, but retains CRDT semantics for CodeMirror-originated edits and for multi-tile sync.

The Yjs document is serialized to the `.tmp` markdown file on disk every 30s in accordance with §9.1.

- Formatting toolbar: bold, italic, underline, strikethrough, inline code, heading levels (H1–H4), blockquote, ordered list, unordered list, task list (checkboxes), horizontal rule, link insert/edit
- Table editing: click into any cell to edit; toolbar buttons to add/remove rows and columns
- Clicking a rendered LaTeX equation does **not** open a popover — edit LaTeX in the Editor Pane; the Preview re-renders instantly
- Clicking a Mermaid diagram navigates the Editor Pane to the correct source line

**Pasting content from the AI Chat Pane:**
- AI responses are rendered markdown. The user can select any portion of an AI response (including rich formatted content — headers, lists, code blocks, tables) and paste it into the Preview Pane, preserving formatting via the Tiptap layer, which round-trips it to the Editor Pane as clean markdown source.
- Alternatively, "Insert into note" buttons on AI responses append the full response as markdown to the current note.

**Drawing blocks:**

Drawings are **block-level elements** in the document flow — they sit between paragraphs, not floating over text. This avoids all reflow and anchor problems. In the markdown source, a drawing block looks like:

````markdown
```drawing
my-diagram.drawing
```
````

In the Preview Pane (and Editor Pane), this renders as an embedded Excalidraw canvas at that position in the document. The canvas has a fixed height (user-resizable by dragging its bottom edge).

- Double-click the rendered drawing to enter **edit mode**: the full Excalidraw toolbar appears (freehand pen, straight line, arrow, rectangle, ellipse, text label, eraser, color/stroke picker)
- Click outside or press `Escape` to exit edit mode; the canvas returns to a static rendered view
- The drawing content is stored in `notes/<filename>.NNNN,drawing` (where `NNNN` is a unique number within the `filename.md` file)
- Insert a new drawing block from the editor toolbar or via `C-c d` (keyboard shortcut); the app inserts the fenced block at cursor position
- **Export:** drawings are exported as embedded SVG or PNG in PDF/HTML/LaTeX output

**Export:**
- Export current note to: PDF, standalone HTML, LaTeX (`.tex`), plain markdown
- For LaTeX export: drawings are embedded as `\includegraphics` with accompanying SVG/PDF render; math pass-through; Mermaid diagrams exported as PDF/SVG figures
- Copy rendered HTML to clipboard

### 5.3 Reference Pane

**Purpose:** Browse, read, and extract content from project reference documents (PDFs and markdown files).

**Features:**

**File selection:** The Reference tile title bar shows the name of the currently displayed file and a `▾` dropdown button. Activating the dropdown (mouse click or `C-x C-r` when the tile is focused) opens a **fuzzy file picker** (same style as VS Code's `Cmd+P`): a text input with a live-filtered list of all files in `references/`, navigable by arrow keys, activated with `Enter`. Typing filters by filename. The picker is dismissed with `Escape`. Drag-and-drop a file from Finder into the tile to open it directly.

- Drag-and-drop into the tile (or the activity sidebar References section) to import new files into `references/`
- **PDF viewer (PDF.js):** keyboard page navigation (`n`/`p` or `PageDown`/`PageUp`), zoom (`Cmd+=`/`Cmd+-`), thumbnail strip toggle, full-text search within the document (`Cmd+F`), text selection and copy
- **Markdown reference viewer:** rendered using the same remark/rehype/KaTeX/Mermaid pipeline as the Preview Pane; read-only
- **Annotation:** select text in any reference → right-click context menu →
  - "Copy" 
    - If pasted into an editor or preview pane, inserts the selected text as a blockquote with a citation footer
    - If pasted into an AI Chat pane, inserts the selected text as a user message in the active AI Chat Pane
  - "Highlight" — saves a highlight annotation to the sidecar file (`<filename>.pdf.annotations` for PDFs)
- PDF annotations (highlights, notes) are persisted in sidecar JSON files; the PDF files themselves are **never modified**
- Full-text search across all references in the project (powered by the Tantivy index in the Rust backend)

### 5.4 AI Chat Pane

**Purpose:** Conversational AI assistance with full awareness of project content.

**AI access to project content:**

The AI backend has tool-use access to the entire project. On each turn, the Rust backend makes the following tools available to the model:

| Tool | Description |
|---|---|
| `search_notes(query)` | Full-text search across all notes in the project; returns ranked excerpts |
| `read_note(slug)` | Returns the full content of a named note |
| `search_references(query)` | Full-text search across all reference documents (PDF text + markdown) |
| `read_reference(filename, page_range?)` | Returns extracted text from a reference document or page range |
| `list_notes()` | Lists all notes in the project with titles and tags |
| `list_references()` | Lists all reference files in the project |

This allows the AI to answer questions like "What did I write about X last week?" or "Is there anything in my references about Y?" without the user manually copying and pasting context.

**Chat interface:**
- Standard chat: user input at bottom, scrollable message history above
- Messages support full markdown rendering (including code blocks with syntax highlighting, LaTeX, and Mermaid diagrams)
- Streaming responses (tokens appear as they arrive)
- **Context controls (manual, in addition to tool use):**
  - "Include current note" toggle: prepends current note content to the next message
  - "Include selection" button: prepends highlighted text from Editor or Preview pane
  - "Include reference page" button: attach a selected page or passage from the Reference Pane
  - Drag-and-drop file attachment (images, text files)

**Session management:**

AI sessions are exactly analogous to the separate chat threads in the Claude web UI: each has an independent conversation history and its own context window. Sessions are named by the user ("Chapter 3 questions", "Literature review", etc.) and stored as `ai-context/<session-id>.json`. The session ID is a UUID v4 generated by the application when the session is created — it is not provided by the AI backend. The human-readable session name is stored inside the JSON file, not in the filename. Multiple sessions can be open in separate tiles simultaneously.

- Tab bar (or tile title bar) identifies the active session by name
- Create new session (blank history) or continue an existing one
- All sessions persisted to disk; git-trackable
- View and edit raw context JSON (power user escape hatch)

**Context window management:**

Claude's context limit is currently 200,000 tokens (~150,000 words), which is large enough that most research sessions will never approach it. The application tracks usage and surfaces it clearly:

- A **context usage bar** in each AI pane header shows current token count as a percentage of the model's limit (e.g., `▓▓▓▓▓▓░░░░ 62% · 124k / 200k tokens`)
- At **75%**: a soft warning appears ("Context window is getting full")
- At **90%**: a prominent warning with two offered actions:
  - **Summarize and continue** — makes a second API call asking Claude to produce a concise summary of the conversation so far; that summary replaces the full history as a single assistant-prefaced context block; the original full history is preserved in the JSON file on disk and is not deleted
  - **Archive and start fresh** — saves the current session, creates a new session with no history (the user can manually paste in a summary if desired)
- The app **never silently truncates** context; any reduction is explicit and confirmed by the user
- Full history is always preserved in the JSON file on disk regardless of what is sent to the API

**Multiple AI panes:**
- "Split AI pane" button opens a second AI panel side-by-side (e.g., Claude Sonnet vs Opus, or two different sessions)

**Actions on AI responses:**
- "Insert into note" button: appends full response (as markdown) to the current note
- "Copy markdown" button: copies raw markdown source
- "Copy formatted" button: copies rich text suitable for pasting into the Preview Pane with formatting preserved
- Regenerate last response
- Edit a previous user message and re-run from that point

**Backend configuration (per project, in project.toml):**
- Backend: Claude (default), extensible (see §7.2)
- Model selector: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`, etc.
- System prompt: editable, stored in `ai-context/system-prompt.md`
- Max tokens, temperature

---

## 6. Project Lifecycle

### 6.1 First Launch and Project Detection

The application is launched with a directory as its argument — either from the terminal (`notesapp ~/research/qft`) or by opening the app bundle when a directory is already the current working directory. On macOS, the app can also be launched via Finder or the Dock, in which case it opens a directory-chooser dialog on startup.

**On opening a directory, the app checks for `.notesapp/project.toml`:**

- **Found:** open the project normally, restore the saved layout
- **Not found:** display a modal dialog:
  > "This directory does not appear to contain a NotesApp project. Would you like to set one up here?"
  > `[ Set up new project ]`  `[ Choose a different directory ]`

**New project wizard** (triggered by the above, or by `File → New Project`):
1. Confirm or edit the project **name** (defaults to the directory name)
2. Optionally add a **description**
3. Optionally enter the **Claude API key** — the app stores it in the macOS Keychain immediately; the field is masked; can be skipped and configured later in settings
4. Select the default **AI model**
5. Optionally paste or write a **system prompt** for the AI
6. `[ Create Project ]` — writes `.notesapp/project.toml`, creates `notes/`, `references/`, `attachments/`, and opens the main window with a blank layout

**Subsequent launches:**
- Recent projects are listed on a startup screen (if no directory argument is given) and in `File → Open Recent`, stored in `~/.config/notesapp/config.toml`
- The last-used layout is restored from `.notesapp/layout.json`

### 6.2 Ongoing Note and Project Management

- **Note naming:** the user provides the filename when creating a new note (`File → New Note` or `C-x C-n`); the app never auto-generates filenames. Spaces are allowed (stored as-is). The `.md` extension is added automatically if omitted. The `title` front-matter field defaults to the filename but can be edited independently.
- **Note management:** rename, delete, reorder in the activity sidebar (sorted by modification time or alphabetically; user preference)
- **Tags:** added to front-matter; browsable in the activity sidebar Tags section
- **Project settings:** `File → Project Settings` opens a panel for AI backend, default model, system prompt, and theme overrides
- **Multiple projects simultaneously:** launch additional instances (`open -na NotesApp --args /path/to/project` in terminal, or from Finder)

---

## 7. AI Backend Integration

### 7.1 Claude (Anthropic)

- Uses the Claude Messages API with streaming and tool use
- Supports vision: paste or drag an image into the chat input to include it as a user message
- The project-search tools (§5.4) are registered as tools in every API call; Claude decides when to invoke them

**API key storage — options in priority order:**

1. **macOS Keychain (default, recommended):** the Rust backend stores and retrieves the API key via the macOS Security framework (`SecItemAdd` / `SecItemCopyMatching`). The key is encrypted by the OS, unlocked at login, and never appears in any file. `config.toml` contains no secrets — only a flag indicating the key is in the keychain. This is the same mechanism used by SSH agents, AWS CLI, and most macOS apps.

2. **`pass` (recommended for power users who already use it):** if configured, the app runs `pass show <path>` via a shell subprocess at startup to retrieve the key. The key is GPG-encrypted on disk and managed entirely outside the application. Configure in `config.toml` with `api_key_source = "pass:notesapp/claude"`.

3. **Plaintext in `config.toml`** (fallback, not recommended): supported for users who accept the tradeoff (e.g., if the file is on an encrypted volume). A warning is shown in the UI when this mode is active. The file should never be committed to git — add `config.toml` to `.gitignore`.

### 7.2 Extensibility

The AI backend is abstracted behind an interface implemented in the Rust layer:

```rust
trait AIBackend: Send + Sync {
    fn name(&self) -> &str;
    fn models(&self) -> Vec<String>;
    fn send_message(
        &self,
        history: &[Message],
        tools: &[ToolDefinition],
        options: &InferenceOptions,
    ) -> impl Stream<Item = Result<StreamEvent>>;
}
```

Additional backends (local Ollama, OpenAI-compatible APIs) can be added by implementing this trait. Active backends are registered in `config.toml`.

---

## 8. Configuration

`~/.config/notesapp/config.toml` (global, not inside any project, never committed to git):

```toml
[general]
theme = "dark"              # "light" | "dark" | "system"
editor_keybindings = "emacs"
spellcheck = true
languagetool = false        # set true if languagetool-server is on $PATH

[recent_projects]
paths = [
  "~/research/qft",
  "~/writing/thesis",
]

[ai.claude]
api_key_source = "keychain"    # "keychain" | "pass:<path>" | "plaintext"
# api_key = "sk-ant-..."       # only used when api_key_source = "plaintext"
default_model = "claude-sonnet-4-6"

[ai.ollama]
enabled = false
base_url = "http://localhost:11434"
```

`<project-dir>/.notesapp/project.toml` (per-project):

```toml
[project]
name = "Quantum Field Theory Notes"
description = "Personal study notes and AI conversations"

[fonts]
editor_font = "JetBrains Mono"
editor_font_size = 14
preview_font = "Inter"
preview_font_size = 16

[ai]
backend = "claude"
model = "claude-opus-4-6"
```

---

## 9. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Preview render latency | < 200ms after keystroke (debounced) |
| Startup time | < 3 seconds to first interactive frame |
| Offline operation | Fully functional except AI chat (which requires network) |
| File storage | Plain text files; no proprietary binary database required for notes |
| Privacy | No telemetry; no data leaves the machine except explicit AI API calls |
| Accessibility | Keyboard-navigable panes; respect OS font size and contrast settings |
| Bundle size | < 50MB installed (Tauri target) |

### 9.1 Error Handling Principles

The two invariants that must never be violated:
1. **The application must not crash on any user-triggered error.** No `panic!`, `unwrap()` on user-facing paths, or `abort()` calls. Rust `Result` types must be handled; panics in background threads must be caught and reported.
2. **User's markdown text must never be silently lost.** This is the highest priority after correctness.

Specific requirements flowing from these:

- **Autosave to `.tmp`:** every 30 seconds of activity, and immediately on window losing focus or the app going to background, the Yjs document is written to `<filename>.tmp` alongside the source `.md` file. The `.md` file is **never touched** by autosave — it is only written by explicit save (`C-x C-s` or `File → Save`). This means the `.md` file always reflects the last deliberate save, and the `.tmp` file holds the most recent unsaved state.
- **Crash recovery:** on opening a project, if any `.tmp` file exists alongside its `.md` counterpart, the app presents a recovery dialog for each: "Unsaved changes were found for `<filename>`. Would you like to recover them?" Choosing recover opens the `.tmp` content in the editor (without saving); the user then reviews and saves explicitly. Choosing discard deletes the `.tmp` file.
- **Pane-level error isolation:** each tile is wrapped in a React Error Boundary. If a tile's component throws an unhandled exception (e.g. a Mermaid diagram with invalid syntax causing a renderer crash), only that tile shows an error card ("Something went wrong in this pane — click to reload") and the rest of the application continues normally.
- **AI errors:** API errors (network failure, rate limit, invalid key, context too long) are shown as an inline error message in the chat pane, not as a dialog or crash. The message includes the error type and a suggested action (e.g. "Rate limited — retry in 30s" with a countdown).
- **File-not-found on layout restore:** tiles whose files have been deleted or renamed outside the app show a `⚠ File not found: <filename>` card with options to locate or dismiss, not a crash or silent blank pane.
- **Renderer errors:** a Mermaid block or KaTeX expression that fails to parse shows an inline error in the preview (e.g. `[Mermaid parse error: …]`) rather than a blank or broken layout.

---

## 10. Phased Implementation Roadmap

Each phase is intended as a self-contained Claude Code session with its own focused prompt. Later phases build on earlier ones but do not require revisiting them. The spec sections relevant to each phase are listed so the implementer can read only what they need.

---

### Phase 1 — Tauri Shell, Layout Engine, and File I/O

**Goal:** A running desktop application with a working tiling layout, a file-backed note list, and persistent layout state. No rendering, no AI.

**Deliverables:**
- Tauri v2 project scaffold (Rust backend + React/TypeScript frontend)
- react-mosaic tiling layout with all four tile types as labeled placeholders
- Activity sidebar (Explorer and References sections; Tags and Search stubbed)
- File I/O: read/write `notes/*.md` and `references/*` via Tauri commands
- `layout.json` persistence: save on structural change, restore on open, "file not found" error cards
- Scroll position save on clean exit / restore on open
- `Ctrl+N` pane focus with number badges; `C-x o/O/b/2/3/0/w/z` layout shortcuts
- First-launch detection and new-project wizard (name, description only — skip AI setup for now)
- `~/.config/notesapp/config.toml` and `.notesapp/project.toml` read/write
- `Cmd+B` sidebar toggle

**Spec sections:** §2, §3.1, §4.0, §4.1, §4.2, §6.1 (wizard only), §6.2 (note/file management), §8, §9.1 (autosave skeleton — `.tmp` write, crash recovery prompt)

**Not in this phase:** any pane content rendering, Emacs keybindings, AI, PDF, Yjs, fonts beyond defaults

---

### Phase 2 — Editor Pane (CodeMirror 6 + Emacs)

**Goal:** A fully functional markdown source editor with all required Emacs behaviors.

**Deliverables:**
- CodeMirror 6 in the Editor tile, loading and displaying `.md` file content
- Syntax highlighting: Markdown, LaTeX (`$...$`, `$$...$$`), Mermaid fenced blocks, drawing fenced blocks
- Emacs keybinding layer: all motions, kill ring, mark/region, `C-x` prefix commands, `M-<`/`M->`
- Keyboard macros: `C-x ( ) e` with `C-u N` repeat
- Rectangle operations: `C-x r k/y/t/o`
- TAB disambiguation (priority rules): heading fold, table cell advance, code block literal tab, indent elsewhere
- Section folding: TAB cycles FOLDED/CHILDREN/SUBTREE; S-TAB toggles all; ▶/▼ indicators
- Org-mode table editing: TAB/S-TAB navigation, auto-reformat, `M-RET`/`M-left/right/up/down`
- `C-x C-s` explicit save (writes `.md`); autosave to `.tmp` every 30s and on focus loss
- Find/replace with regex (`C-s`, `C-r`, `C-M-s`)
- Line numbers, word wrap toggle, word/character count
- OS native spellcheck enabled; suppressed in code/LaTeX/Mermaid blocks
- `Cmd+=/-/0` font size adjustment for focused Editor tile

**Spec sections:** §5.1, §9.1 (autosave)

**Not in this phase:** Yjs sync, preview rendering, drawing blocks

---

### Phase 3 — Preview Pane (Read-Only Rendering)

**Goal:** A rendered view of the current note that updates as the editor changes, with scroll sync.

**Deliverables:**
- Preview tile rendering markdown via remark/rehype pipeline
- KaTeX rendering for inline (`$...$`) and display (`$$...$$`) LaTeX
- Mermaid.js rendering for fenced `mermaid` blocks
- Drawing blocks (```` ```drawing ```` ) rendered as static placeholder canvas (Excalidraw not yet interactive)
- Debounced re-render (~150ms) on editor keystrokes
- Scroll sync between Editor and Preview tiles for the same note
- Inline render error messages for malformed KaTeX or Mermaid (no crashes)
- `Cmd+=/-/0` font size adjustment for focused Preview tile

**Spec sections:** §5.2 (rendering pipeline only), §4.3 (fonts)

**Not in this phase:** Yjs CRDT, WYSIWYG editing in preview, Excalidraw interaction

---

### Phase 4 — Yjs CRDT Bridge (Bidirectional Sync)

**Goal:** Editor and Preview tiles are fully bidirectional — editing in either immediately updates the other.

**Deliverables:**
- Yjs document per open note, shared across all tiles for that note
- `y-codemirror.next` binding: `Y.Text` ↔ CodeMirror state
- Bridge layer: `Y.Text` changes trigger remark parse → ProseMirror node tree update; Tiptap edits serialize back to markdown → `Y.Text`
- `y-prosemirror` binding: `Y.XmlFragment` ↔ Tiptap state
- Tiptap WYSIWYG formatting toolbar active: bold, italic, underline, strikethrough, inline code, headings, blockquote, lists, task list, HR, link
- Table editing in Tiptap (click-to-edit cells, add/remove rows/columns)
- Multiple tiles for the same note stay in sync
- Paste from AI Chat Pane into Preview preserves formatting (via Tiptap clipboard handler)
- "Insert into note" action from AI Chat Pane (append markdown to `Y.Text`)

**Spec sections:** §5.2 (WYSIWYG and Yjs sections), §5.4 (Insert into note / Copy formatted)

**Not in this phase:** Excalidraw drawing interaction (drawing blocks remain static renders)

---

### Phase 5 — AI Chat Pane (Basic Chat)

**Goal:** Working AI chat with session management, context controls, and context window tracking. No tool use yet.

**Deliverables:**
- AI Chat tile: message history, streaming input, markdown rendering of responses
- Claude API integration via Tauri Rust backend (streaming via `reqwest`)
- macOS Keychain API key storage; `pass` alternative; plaintext fallback with warning
- New-project wizard: add API key and model selection steps
- Session management: create/rename/switch sessions; UUID v4 session IDs; name stored in JSON
- Tab bar for switching sessions within a tile
- Context usage bar (`▓▓░░ 62% · 124k / 200k tokens`); 75% warning; 90% Summarize / Archive actions
- Manual context controls: "Include current note", "Include selection", drag-and-drop attachment
- Response actions: "Insert into note", "Copy markdown", "Copy formatted", Regenerate, Edit+rerun
- Model selector and temperature/max-tokens controls in project settings
- System prompt editing (`ai-context/system-prompt.md`)
- Raw context JSON viewer

**Spec sections:** §5.4, §7.1, §8 (AI config), §6.1 (wizard AI steps)

**Not in this phase:** AI tool use (search/read project files)

---

### Phase 6 — AI Tool Use (Project Search and Retrieval)

**Goal:** The AI can autonomously search and read notes and references in the project.

**Deliverables:**
- Tantivy full-text search index built in Rust backend, indexing all `notes/*.md` on open and on file change
- PDF text extraction (via `pdfium` or `lopdf`) feeding Tantivy index for `references/*.pdf`
- Tauri commands exposing: `search_notes`, `read_note`, `search_references`, `read_reference`, `list_notes`, `list_references`
- Tool definitions registered with every Claude API call
- Tool call / tool result round-trip handled transparently in the chat backend
- Activity sidebar Search section: full-text search UI with results grouped by file (VS Code style)
- `Cmd+Shift+F` global search shortcut

**Spec sections:** §2.3, §4.2 (search), §5.4 (AI tool table)

---

### Phase 7 — Reference Pane (PDF + Markdown Viewer)

**Goal:** Fully functional reference document viewer with annotation and extraction.

**Deliverables:**
- Reference tile with fuzzy file picker in title bar (`C-x C-r` or `▾` dropdown)
- PDF.js viewer: page navigation (`n`/`p`, PageDown/Up), thumbnail strip, zoom (`Cmd+=/-`), in-document search (`Cmd+F`), text selection
- Markdown reference viewer: read-only, same remark/rehype/KaTeX/Mermaid pipeline as Preview
- Text selection → right-click → "Copy": smart paste behavior (blockquote+citation into Editor/Preview; plain text into AI Chat)
- PDF highlight annotations stored in `<filename>.pdf.annotations` sidecar JSON; rendered as overlays
- Drag-and-drop file import into `references/`
- Activity sidebar References section populated and functional

**Spec sections:** §5.3, §4.2 (References sidebar section)

---

### Phase 8 — Drawing Blocks (Excalidraw)

**Goal:** Interactive Excalidraw canvases embedded as block elements in notes.

**Deliverables:**
- ```` ```drawing ```` fenced blocks render as live Excalidraw canvases in Preview and Editor tiles
- Double-click to enter edit mode; Escape to exit
- Drawing content stored as `notes/<note-basename>.NNNN.drawing` (JSON); auto-numbered per note
- `C-c d` / toolbar button inserts a new drawing block at cursor; file created automatically
- Canvas height user-resizable by dragging bottom edge
- Drawing renders as static SVG in read/display mode

**Spec sections:** §5.2 (Drawing blocks), §3.1 (`.drawing` files)

---

### Phase 9 — Export

**Goal:** Notes can be exported as standalone documents for sharing.

**Deliverables:**
- Export to PDF (via headless Chromium print or `wkhtmltopdf`)
- Export to standalone HTML (self-contained: inline CSS, base64 images)
- Export to LaTeX (`.tex`): math pass-through, Mermaid diagrams as PDF/SVG figures via `\includegraphics`, drawings embedded as SVG/PDF
- Export to plain markdown (strip front-matter or keep, user option)
- "Copy rendered HTML" to clipboard

**Spec sections:** §5.2 (Export section)

---

### Phase 10 — Polish and Hardening

**Goal:** Production-quality error handling, onboarding, and UX finishing touches.

**Deliverables:**
- React Error Boundaries on all tiles with "Something went wrong — click to reload" card
- All Rust `Result` types handled; no `unwrap()` on user-facing paths; background thread panics caught and surfaced
- Crash recovery: `.tmp` file detection on open, recovery dialog
- LanguageTool optional integration (check for `languagetool-server` on `$PATH`)
- Complete first-launch wizard (all steps including API key, model, system prompt)
- `Cmd+=/-/0` font size per pane, reset to `project.toml` defaults on project open
- Per-pane number badge overlay while `Ctrl` is held
- Full `~/.config/notesapp/config.toml` and `project.toml` settings UI (not just hand-editing)
- macOS app bundle packaging: code signing, notarization, `.dmg` installer

**Spec sections:** §6.1, §8, §9.1, §4.1 (Ctrl+N badges), §4.3 (fonts)

---

## 11. Out of Scope (v1)

- Real-time collaboration / multiplayer
- Mobile or tablet clients
- Cloud sync — the filesystem layout is flat and git-friendly; users sync manually if desired
- Built-in version history UI — users manage this with git externally
- Plugin marketplace

---

## 12. Resolved Design Decisions

| Question | Decision | Rationale |
|---|---|---|
| Drawing storage | Sidecar `.drawing` file; never embedded in the `.md` source | Keeps markdown clean and portable; drawings embedded during export |
| Export format | Notes export to PDF, HTML, LaTeX, and plain markdown; drawings embedded as SVG/PNG in output | Enables sharing as a single file without requiring the app |
| WYSIWYG ↔ source fidelity | Seamlessly bidirectional; every WYSIWYG edit immediately updates the source and vice versa | User requires a single source of truth; no mode-switch friction |
| LaTeX editing in WYSIWYG mode | Always edit LaTeX in the source (Editor Pane); Preview re-renders after each change | Avoids complexity of in-place equation editors; source pane is always open |
| AI context window management | Manual "prune history" button; full history preserved in JSON file on disk | User will manage state via git externally; can recover from any truncation decision |
| PDF annotation storage | Sidecar JSON files; PDF files never modified | Avoids any risk of PDF corruption; annotations are git-diffable |
| Multi-project support | One project per application instance; launch multiple instances for multiple projects | Simpler architecture; user can arrange instances side-by-side with the OS window manager |
| Pane layout | react-mosaic binary-tree tiling; no fixed grid; user arranges arbitrarily | User needs 2×2, 3-column, and other layouts; no hardcoded assumption about what panes exist |
| Note filenames | User-named; application never auto-generates filenames | Notes are managed in git; user needs predictable, meaningful filenames |
| API key storage | macOS Keychain by default; `pass` as documented alternative; plaintext with warning as fallback | Keys must not appear in git-tracked files; OS keychain is the standard macOS secure storage |
| Context window management | Token usage bar; explicit Summarize or Archive actions at 90%; full history always preserved on disk | User manages state in git; no silent truncation; transparency over automation |
| TAB key behavior | Context-sensitive: heading line → fold/unfold; table cell → advance cell; code block → literal tab; elsewhere → indent to match previous line | Three distinct Emacs/Org-mode behaviors needed; priority rules resolve conflicts |
| WYSIWYG sync mechanism | Yjs CRDT; `Y.Text` (markdown) is source of truth; `Y.XmlFragment` (Tiptap) derived via bridge; Tiptap edits serialized back to markdown | Correctness preferred over simplicity; `Y.Text` and `Y.XmlFragment` are different types requiring an explicit translation layer |
| Drawing model | Block-level elements between paragraphs (fenced ` ```drawing ``` ` block); not a floating overlay | Drawings are discrete blocks, not annotations on text; no reflow/anchor problems |
| Reference tile file selection | Fuzzy file picker in tile title bar (keyboard-activatable, arrow-key navigable); no persistent sidebar | Sidebar wastes space in narrow tiles; fuzzy picker is faster for keyboard users |
| Layout persistence | Written to `.notesapp/layout.json` on every structural change; maximize/unmaximize not saved; scroll positions saved on clean exit | Saves deliberate arrangements immediately; transient full-screen state not persisted; scroll state only reliable on clean exit |
| AI session ID | UUID v4 generated by the app; human-readable name stored inside the JSON file | Session identity is an app concept, not provided by the AI backend; UUIDs are collision-free and require no coordination |
| First launch / project setup | App detects absence of `.notesapp/project.toml` and offers setup wizard in-place | User launches app from their project directory; no separate "data root" needed |
| Autosave target | Autosave writes to `<file>.tmp` only; `.md` file updated only on explicit save | User wants the `.md` file to reflect deliberate saves; `.tmp` provides crash safety without surprise edits |
| Error handling | No crashes on user error; per-tile React Error Boundaries; inline AI error messages | Protecting text data is the highest priority; failures must be visible and localised |
| Fonts | Defaults (editor: JetBrains Mono 14px; preview: Inter 16px) stored in `project.toml`; font size adjustments apply to focused pane only and reset on project open | Per-project defaults make sense; per-pane transient sizing avoids global disruption |
| Pane focus shortcuts | `Ctrl+N` (1–9) focuses tile N in reading order; number badges shown while Ctrl is held | Fast keyboard navigation without needing to cycle through all panes |
| Spellcheck | OS native spellcheck by default; optional LanguageTool (local) for grammar; suppressed in code/LaTeX/Mermaid blocks | Spelling help in prose; no false positives inside technical content |

## 13. Additional thoughts and features to be considered for later
- Mechanism for editing the global configuration data stored in `~/.config/notesapp/config.toml`.
- Change kaybondings so that `C-x h` splits a pane horizontally, `C-x v` spits a pane vertically, and `C-x N` is used to switch to pane number `N` instead of `C-N`.
