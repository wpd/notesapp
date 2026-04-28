// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/// Spell-check `text` and return every misspelled word as a `[from, to]`
/// character-position pair (UTF-16 code units, matching JavaScript's string
/// indexing).  Uses NSSpellChecker on macOS; returns an empty list elsewhere.
#[tauri::command]
pub fn check_spelling(text: String) -> Vec<[usize; 2]> {
    #[cfg(target_os = "macos")]
    {
        crate::macos::find_misspelled_ranges(&text)
            .into_iter()
            .map(|(from, to)| [from, to])
            .collect()
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
        vec![]
    }
}
