# Visual Design — NotesApp

The visual theme is specified precisely and must be implemented from day
one. Do not use placeholder colors or defer theming to "later."

The CSS file `src/styles/tokens.css` is the **source of truth** for
colors and typography. The values reproduced here are documentation of
that source of truth — when they drift, the CSS file wins, and this doc
should be updated in the same change.

---

## 1. Color Tokens

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

Component code uses the CSS variables only. Hardcoded hex values in
component files are forbidden (see `CLAUDE.md §6`).

---

## 2. Typography

Both fonts are bundled in `public/fonts/` and loaded via `@font-face`
in `tokens.css`. Do not rely on system font availability.

```css
--font-editor:   'JetBrains Mono', monospace;   /* editor tile */
--font-prose:    'Inter', sans-serif;            /* preview, chat, UI chrome */
--font-size-editor-default: 14px;
--font-size-prose-default:  16px;
```

---

## 3. Tile Title Bar

Every tile has a title bar containing these elements, in order, per
SPEC.md §4.0:

- **Mode indicator.** Shows the tile's current mode (`Editor`,
  `Preview`, `Reference`, `AI Chat`, or `⚠ Missing`). On Editor and
  Preview tiles it is a clickable toggle that switches the tile between
  those two modes (subject to the markdown-only restriction in SPEC.md
  §4.0.1 — greyed out when the bound file is not `.md`). On Reference,
  AI Chat, and Missing tiles the indicator is a plain label, not
  interactive.
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

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
