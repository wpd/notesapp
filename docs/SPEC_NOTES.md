# Spec Interpretation Notes — NotesApp

These notes resolve open questions or ambiguities in `SPEC.md` that
came up during the spec interview and during implementation. They are
authoritative for behavior not fully nailed down by SPEC.md itself.

When SPEC.md and this file conflict, SPEC.md wins — flag the conflict
to the user rather than silently resolving.

Read the relevant section before working on the corresponding feature.

---

## 1. Tile Modes and Buffer Binding (SPEC.md §4.0.1)

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

---

## 2. Last-Tile Release of a Modified Buffer (SPEC.md §4.0.1)

When a tile's mode changes, buffer changes, tile is closed, or window
is closed, and that tile was the *last* tile bound to a modified
buffer, the application must prompt: Save / Discard / Cancel. Cancel
aborts the release entirely. On app quit with multiple modified
buffers, a single consolidated dialog lists them with per-buffer
Save/Discard checkboxes.

Missing-tile recovery uses a simpler Continue/Cancel prompt (saving is
not meaningful when the underlying file is gone) — see SPEC.md §5.5.

---

## 3. Primary Note ("Insert into Note" target) (SPEC.md §4.4)

When the user clicks "Insert into note" in an AI Chat tile, the target
is the **primary note** — the Editor tile that is currently pinned.

- The pin is toggled with `C-x p` or by clicking the pin icon in the
  tile title bar.
- Only one Editor tile can be pinned at a time; pinning a new tile
  unpins the previous one.
- The pin icon is **only shown on Editor tiles** (not Preview,
  Reference, AI Chat, or Missing tiles).
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

---

## 4. Activity Sidebar Contents (SPEC.md §4.2)

The sidebar contains four sections (Explorer, Search, Tags,
References), each collapsible, with per-project memory of which
sections are open. Interaction model is **browse only** — clicking a
file does not open it. To load a file into a tile, use `C-x b` or drag
from the sidebar onto a tile.

The order in which these sections are implemented is specified in
`ROADMAP.md`, not here. Claude Code should check ROADMAP.md for the
current phase's sidebar deliverables rather than assuming all four
sections exist in every phase.

---

## 5. `NOTESAPP_PROJECT_DIR` Resolution (SPEC.md §6.1.1)

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

---

## 6. Tauri vs Electron

Tauri v2 is the confirmed choice. Do not revisit this.

---

## 7. WYSIWYG Preview Tile — Phase 2 Resolutions (SPEC.md §5.2)

### 7.1 Drawing NNNN Allocation

Sidecar filenames use 4-digit zero-padded NNNN: `<note-stem>.NNNN.drawing`.
Allocation: `max(existing NNNN for this note) + 1`; starts at 1 if none
exist. Numbers are never reused; orphan numbers (from deleted fences) are
tolerated and gaps are preserved. The Rust command `next_drawing_number`
implements this.

### 7.2 Sidecar JSON Shape

Native Excalidraw export format:
```json
{ "type": "excalidraw", "version": 2, "source": "notesapp",
  "elements": [], "appState": {}, "files": {} }
```

### 7.3 Orphan Cleanup on Fence Delete

When a `drawing`-fenced block is deleted from the markdown, the sidecar
file is **kept on disk** (preserves undo; user can recover). GC of orphan
sidecars is out of Phase 2 scope.

### 7.4 Sidecar Reference in Fence

The inner fence content is the **basename only**: `<stem>.NNNN.drawing`.
This resolves the SPEC.md §3.2 vs §5.2 example mismatch in favor of §3.2.
`DrawingBlock` resolves the basename against the note's directory at runtime.

### 7.5 Sidecar Autosave Model

Mirrors the `.md` autosave pattern: Excalidraw onChange (debounced 30 s)
writes `<sidecar>.drawing.tmp`. On Escape/click-outside exit from edit
mode the `.drawing` file is written and the `.tmp` is deleted.

### 7.6 Front-matter in WYSIWYG

Front-matter is never visible or editable in the Tiptap editor. It is
stripped by `splitFrontmatter` before the body is passed to
`markdownToProseMirror`, stored in `Y.Map("meta")`, and prepended back on
every reverse-bridge serialize.

### 7.7 Mermaid Click-to-Navigate-Source (SPEC.md §5.2 line 498)

Deferred to a later phase. Filed in ISSUES.md.

### 7.8 SPEC.md Cleanup Tasks

- SPEC.md §5.2 drawing fence example should be updated to match §3.2
  (`<stem>.NNNN.drawing` basename form). Filed in ISSUES.md.
- SPEC.md §4.1 master shortcut table should add `C-c d` row. Filed in
  ISSUES.md.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
