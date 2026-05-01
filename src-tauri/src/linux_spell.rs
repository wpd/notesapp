// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

use std::sync::OnceLock;

static DICTIONARY: OnceLock<Option<spellbook::Dictionary>> = OnceLock::new();

/// Derive the locale tag to use for dictionary lookup (e.g. "en_US").
/// Reads LANG then LC_MESSAGES; strips any codeset suffix (.UTF-8).
/// Falls back to "en_US" if both are unset or set to "C"/"POSIX".
fn derive_lang() -> String {
    for var in &["LANG", "LC_MESSAGES"] {
        if let Ok(val) = std::env::var(var) {
            let tag = val.split('.').next().unwrap_or("").to_string();
            if tag.len() >= 2 && tag != "C" && tag != "POSIX" {
                return tag;
            }
        }
    }
    "en_US".to_string()
}

fn load_dictionary() -> Option<spellbook::Dictionary> {
    let lang = derive_lang();

    let xdg_data_home = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
        std::env::var("HOME")
            .map(|h| format!("{h}/.local/share"))
            .unwrap_or_default()
    });

    let search_dirs: Vec<String> = vec![
        format!("{xdg_data_home}/hunspell"),
        "/usr/share/hunspell".to_string(),
        "/usr/share/myspell/dicts".to_string(),
        "/usr/local/share/hunspell".to_string(),
    ]
    .into_iter()
    .filter(|d| !d.is_empty() && !d.starts_with('/') || d.starts_with('/'))
    .filter(|d| !d.is_empty())
    .collect();

    let searched: Vec<String> = search_dirs
        .iter()
        .map(|d| format!("{d}/{lang}.aff"))
        .collect();

    for dir in &search_dirs {
        let aff_path = format!("{dir}/{lang}.aff");
        let dic_path = format!("{dir}/{lang}.dic");

        let aff = match std::fs::read_to_string(&aff_path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let dic = match std::fs::read_to_string(&dic_path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        match spellbook::Dictionary::new(&aff, &dic) {
            Ok(dict) => {
                log::info!("Spell-check dictionary loaded: {aff_path}");
                return Some(dict);
            }
            Err(e) => {
                log::warn!("Spell-check dictionary {aff_path} parse error: {e:?}");
            }
        }
    }

    log::warn!(
        "No spell-check dictionary found for `{lang}`. \
         Searched: {paths}. \
         Install a Hunspell dictionary (e.g. `sudo apt install hunspell-en-us`).",
        paths = searched.join(", "),
    );
    None
}

/// Return (from, to) UTF-16 code-unit pairs for every misspelled word in
/// `text`.  Uses the system Hunspell dictionary via spellbook.
/// Positions match JavaScript's String indexing convention, same as macos.rs.
/// Returns an empty Vec if no dictionary is available.
pub fn find_misspelled_ranges(text: &str) -> Vec<(usize, usize)> {
    let dict = DICTIONARY.get_or_init(load_dictionary);
    let dict = match dict.as_ref() {
        Some(d) => d,
        None => return vec![],
    };

    tokenize_utf16(text)
        .into_iter()
        .filter(|(word, _, _)| !dict.check(word))
        .map(|(_, from, to)| (from, to))
        .collect()
}

/// Tokenize `text` into (word, utf16_start, utf16_end) triples.
///
/// A word is a run of alphabetic or numeric characters, with apostrophes and
/// hyphens allowed mid-word.  Tokens that contain a digit are omitted so that
/// technical identifiers like "IPv6" or "3rd" are not flagged.  Leading and
/// trailing apostrophes/hyphens are stripped.  Tokens shorter than two
/// characters after stripping are discarded.
fn tokenize_utf16(text: &str) -> Vec<(String, usize, usize)> {
    let mut tokens: Vec<(String, usize, usize)> = Vec::new();
    let mut utf16_pos: usize = 0;

    // State for the current word being accumulated.
    let mut word_start: Option<usize> = None;
    let mut word_buf = String::new();

    let flush = |tokens: &mut Vec<(String, usize, usize)>,
                 buf: &str,
                 start: usize,
                 end: usize| {
        // Strip leading and trailing apostrophes / hyphens.
        let trimmed = buf.trim_matches(|c| c == '\'' || c == '-');
        if trimmed.chars().count() < 2 {
            return;
        }
        // Skip tokens that contain a digit (technical identifiers, ordinals).
        if trimmed.chars().any(|c| c.is_numeric()) {
            return;
        }
        // Recompute UTF-16 span after stripping.
        let prefix_utf16: usize = buf
            .chars()
            .take_while(|&c| c == '\'' || c == '-')
            .map(|c| c.len_utf16())
            .sum();
        let suffix_utf16: usize = buf
            .chars()
            .rev()
            .take_while(|&c| c == '\'' || c == '-')
            .map(|c| c.len_utf16())
            .sum();
        let adj_start = start + prefix_utf16;
        let adj_end = end.saturating_sub(suffix_utf16);
        if adj_end > adj_start {
            tokens.push((trimmed.to_string(), adj_start, adj_end));
        }
    };

    for ch in text.chars() {
        let extends_word = ch.is_alphabetic()
            || ch.is_numeric()
            || ((ch == '\'' || ch == '-') && word_start.is_some());

        if extends_word {
            if word_start.is_none() {
                word_start = Some(utf16_pos);
            }
            word_buf.push(ch);
        } else if let Some(start) = word_start.take() {
            let buf = word_buf.clone();
            flush(&mut tokens, &buf, start, utf16_pos);
            word_buf.clear();
        }

        utf16_pos += ch.len_utf16();
    }

    if let Some(start) = word_start {
        let buf = word_buf.clone();
        flush(&mut tokens, &buf, start, utf16_pos);
    }

    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    // Minimal fixture dictionary used in all unit tests.  Contains a small
    // set of valid words so we can assert which ones are flagged.
    const TEST_AFF: &str = include_str!("../tests/fixtures/test_en.aff");
    const TEST_DIC: &str = include_str!("../tests/fixtures/test_en.dic");

    fn test_dict() -> spellbook::Dictionary {
        spellbook::Dictionary::new(TEST_AFF, TEST_DIC).expect("test fixture dictionary")
    }

    // Helper: call find_misspelled_ranges with the test fixture dictionary
    // instead of the system dictionary.
    fn check_ranges(text: &str) -> Vec<(usize, usize)> {
        let dict = test_dict();
        tokenize_utf16(text)
            .into_iter()
            .filter(|(word, _, _)| !dict.check(word))
            .map(|(_, from, to)| (from, to))
            .collect()
    }

    // -------------------------------------------------------------------------
    // derive_lang
    // -------------------------------------------------------------------------

    #[test]
    fn derive_lang_uses_lang_env() {
        std::env::set_var("LANG", "en_GB.UTF-8");
        std::env::remove_var("LC_MESSAGES");
        assert_eq!(derive_lang(), "en_GB");
        std::env::remove_var("LANG");
    }

    #[test]
    fn derive_lang_uses_lc_messages_fallback() {
        std::env::remove_var("LANG");
        std::env::set_var("LC_MESSAGES", "fr_FR.UTF-8");
        assert_eq!(derive_lang(), "fr_FR");
        std::env::remove_var("LC_MESSAGES");
    }

    #[test]
    fn derive_lang_defaults_when_c_locale() {
        std::env::set_var("LANG", "C");
        std::env::remove_var("LC_MESSAGES");
        assert_eq!(derive_lang(), "en_US");
        std::env::remove_var("LANG");
    }

    #[test]
    fn derive_lang_defaults_when_unset() {
        std::env::remove_var("LANG");
        std::env::remove_var("LC_MESSAGES");
        assert_eq!(derive_lang(), "en_US");
    }

    // -------------------------------------------------------------------------
    // tokenize_utf16 — ASCII
    // -------------------------------------------------------------------------

    #[test]
    fn tokenize_simple_words() {
        let tokens = tokenize_utf16("hello world");
        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].0, "hello");
        assert_eq!(tokens[0].1, 0);
        assert_eq!(tokens[0].2, 5);
        assert_eq!(tokens[1].0, "world");
        assert_eq!(tokens[1].1, 6);
        assert_eq!(tokens[1].2, 11);
    }

    #[test]
    fn tokenize_strips_leading_trailing_punctuation() {
        let tokens = tokenize_utf16("'word'");
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, "word");
        // Apostrophes are ASCII (1 UTF-16 unit each), so start=1, end=5.
        assert_eq!(tokens[0].1, 1);
        assert_eq!(tokens[0].2, 5);
    }

    #[test]
    fn tokenize_keeps_internal_apostrophe() {
        let tokens = tokenize_utf16("it's");
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, "it's");
        assert_eq!(tokens[0].1, 0);
        assert_eq!(tokens[0].2, 4);
    }

    #[test]
    fn tokenize_skips_digit_tokens() {
        let tokens = tokenize_utf16("IPv6 hello 3rd");
        // "IPv6" and "3rd" contain digits → omitted; "hello" → kept.
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, "hello");
    }

    #[test]
    fn tokenize_skips_short_tokens() {
        let tokens = tokenize_utf16("a bb ccc");
        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].0, "bb");
        assert_eq!(tokens[1].0, "ccc");
    }

    // -------------------------------------------------------------------------
    // tokenize_utf16 — non-BMP / multi-unit characters
    // -------------------------------------------------------------------------

    #[test]
    fn tokenize_utf16_offsets_with_non_ascii_before_word() {
        // "café" has a BMP 'é' (1 UTF-16 unit) at byte offset 3.
        // UTF-16: c=1 a=1 f=1 é=1  → "café" spans UTF-16 [0..4]
        let tokens = tokenize_utf16("café");
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, "café");
        assert_eq!(tokens[0].1, 0);
        assert_eq!(tokens[0].2, 4); // 4 UTF-16 code units
    }

    #[test]
    fn tokenize_utf16_emoji_before_word() {
        // U+1F600 GRINNING FACE is a non-BMP character: 2 UTF-16 units.
        // "😀 hello" → emoji at [0..2], space at [2], "hello" at [3..8]
        let text = "😀 hello";
        let tokens = tokenize_utf16(text);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].0, "hello");
        assert_eq!(tokens[0].1, 3); // 2 (emoji) + 1 (space)
        assert_eq!(tokens[0].2, 8);
    }

    // -------------------------------------------------------------------------
    // check_ranges (integration with test fixture dictionary)
    // -------------------------------------------------------------------------

    #[test]
    fn correct_words_not_flagged() {
        let ranges = check_ranges("the quick brown fox");
        assert!(ranges.is_empty(), "expected no misspellings, got {ranges:?}");
    }

    #[test]
    fn misspelled_words_are_flagged() {
        // "teh" and "quikc" are not in the fixture dictionary.
        let ranges = check_ranges("teh quikc brown fox");
        assert_eq!(ranges.len(), 2, "expected 2 misspellings, got {ranges:?}");
        // "teh" is at [0..3], "quikc" is at [4..9]
        assert_eq!(ranges[0], (0, 3));
        assert_eq!(ranges[1], (4, 9));
    }

    #[test]
    fn correct_offsets_after_correct_word() {
        // "hello teh" — "hello" ok, "teh" misspelled at [6..9]
        let ranges = check_ranges("hello teh");
        assert_eq!(ranges, vec![(6, 9)]);
    }

    #[test]
    fn no_ranges_for_empty_string() {
        assert!(check_ranges("").is_empty());
    }

    #[test]
    fn technical_identifiers_not_flagged() {
        // Tokens containing digits are skipped entirely.
        let ranges = check_ranges("IPv6 OAuth2 3rd");
        assert!(ranges.is_empty(), "digit-containing tokens must be skipped, got {ranges:?}");
    }
}
