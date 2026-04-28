// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

interface SpellingRange {
  from: number;
  to: number;
}

// Dispatch this effect to replace the full set of spelling error decorations.
export const setSpellingErrors = StateEffect.define<SpellingRange[]>();

const spellingMark = Decoration.mark({ class: "cm-spelling-error" });

// Holds the current set of spelling-error underline decorations.
//
// On every document change we:
//   1. Remap existing marks through the change (shifts/shrinks positions).
//   2. Immediately clear marks that cover any newly-inserted text — the old
//      spelling judgment is no longer valid for edited regions.
// A debounced full re-check in SpellcheckTrigger will later restore marks for
// any words that are still misspelled after editing.
export const spellingDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    if (tr.docChanged) {
      decorations = decorations.map(tr.changes);
      // Remove marks overlapping ranges where new text was inserted.
      tr.changes.iterChanges((_fromA, _toA, fromB, toB) => {
        if (toB > fromB) {
          decorations = decorations.update({
            filter: (from, to) => to <= fromB || from >= toB,
            filterFrom: fromB,
            filterTo: toB,
          });
        }
      });
    }
    for (const effect of tr.effects) {
      if (effect.is(setSpellingErrors)) {
        decorations =
          effect.value.length === 0
            ? Decoration.none
            : Decoration.set(
                effect.value.map(({ from, to }) =>
                  spellingMark.range(from, to),
                ),
                true, // presorted by from
              );
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});
