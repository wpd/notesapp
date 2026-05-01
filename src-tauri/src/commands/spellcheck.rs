// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/// Spell-check `text` and return every misspelled word as a `[from, to]`
/// character-position pair (UTF-16 code units, matching JavaScript's string
/// indexing).  Uses NSSpellChecker on macOS and spellbook (Hunspell) on Linux.
/// Returns an empty list on other platforms or when no dictionary is available.
#[tauri::command]
pub fn check_spelling(text: String) -> Vec<[usize; 2]> {
    #[cfg(target_os = "macos")]
    {
        crate::macos::find_misspelled_ranges(&text)
            .into_iter()
            .map(|(from, to)| [from, to])
            .collect()
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        crate::linux_spell::find_misspelled_ranges(&text)
            .into_iter()
            .map(|(from, to)| [from, to])
            .collect()
    }
    #[cfg(not(any(target_os = "macos", all(unix, not(target_os = "macos")))))]
    {
        let _ = text;
        vec![]
    }
}
