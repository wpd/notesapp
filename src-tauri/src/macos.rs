// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

use objc2::encode::{Encode, Encoding, RefEncode};
use objc2::runtime::{AnyObject, Bool};
use objc2::{class, msg_send};
use std::ffi::CStr;

// NSRange mirrors the layout of Objective-C's NSRange struct.  The encoding
// name "_NSRange" matches the ObjC runtime's type descriptor so msg_send! can
// return and receive this struct by value.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct NSRange {
    pub location: usize,
    pub length: usize,
}

unsafe impl Encode for NSRange {
    const ENCODING: Encoding =
        Encoding::Struct("_NSRange", &[usize::ENCODING, usize::ENCODING]);
}

unsafe impl RefEncode for NSRange {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

const NS_NOT_FOUND: usize = usize::MAX;

/// Return (from, to) character-position pairs for every misspelled word in
/// `text`, using NSSpellChecker with the system's default language.  Positions
/// are in NSString units (UTF-16 code units), which match JavaScript's string
/// indexing for BMP text — i.e. the values can be used directly as CodeMirror
/// document positions for English and most other languages.
pub fn find_misspelled_ranges(text: &str) -> Vec<(usize, usize)> {
    let Ok(c_text) = std::ffi::CString::new(text) else {
        return vec![];
    };
    unsafe {
        let null: *mut AnyObject = std::ptr::null_mut();
        let wc_null: *mut isize = std::ptr::null_mut();

        let checker: *mut AnyObject =
            msg_send![class!(NSSpellChecker), sharedSpellChecker];
        let ns_text: *mut AnyObject =
            msg_send![class!(NSString), stringWithUTF8String: c_text.as_ptr()];
        let ns_len: usize = msg_send![ns_text, length];

        let mut results = Vec::new();
        let mut search_from: usize = 0;

        loop {
            if search_from >= ns_len {
                break;
            }
            let range: NSRange = msg_send![
                checker,
                checkSpellingOfString: ns_text
                startingAt: search_from as isize
                language: null
                wrap: Bool::NO
                inSpellDocumentWithTag: 0isize
                wordCount: wc_null
            ];
            if range.length == 0 || range.location == NS_NOT_FOUND {
                break;
            }
            let to = range.location.saturating_add(range.length);
            results.push((range.location, to));
            search_from = to;
        }
        results
    }
}

// Set both NS* and Web* variants: different WKWebView/WebKit versions read
// different key prefixes. Call this before tauri::Builder::default() so the
// values are in NSUserDefaults before any WKWebView reads them at init time.
//
// FALSE_KEYS: transformative substitutions that corrupt Markdown literals.
// TRUE_KEYS: continuous spell-checking — must be set explicitly to YES
// because WKWebView in an embedded Tauri context does not enable it by
// default, even if the system preference is on.
const FALSE_KEYS: &[&CStr] = &[
    c"NSAutomaticDashSubstitutionEnabled",
    c"NSAutomaticQuoteSubstitutionEnabled",
    c"NSAutomaticPeriodSubstitutionEnabled",
    c"NSAutomaticTextReplacementEnabled",
    c"NSAutomaticSpellingCorrectionEnabled",
    c"WebAutomaticDashSubstitutionEnabled",
    c"WebAutomaticQuoteSubstitutionEnabled",
    c"WebAutomaticPeriodSubstitutionEnabled",
    c"WebAutomaticTextReplacementEnabled",
    c"WebAutomaticSpellingCorrectionEnabled",
];

const TRUE_KEYS: &[&CStr] = &[
    c"WebContinuousSpellCheckingEnabled",
    c"NSContinuousSpellCheckingEnabled",
];

pub fn disable_smart_substitutions() {
    unsafe {
        let ud: *mut AnyObject =
            msg_send![class!(NSUserDefaults), standardUserDefaults];
        let nsstring_cls = class!(NSString);
        for key in FALSE_KEYS {
            let ns_key: *mut AnyObject =
                msg_send![nsstring_cls, stringWithUTF8String: key.as_ptr()];
            let _: () = msg_send![ud, setBool: Bool::NO, forKey: ns_key];
        }
        for key in TRUE_KEYS {
            let ns_key: *mut AnyObject =
                msg_send![nsstring_cls, stringWithUTF8String: key.as_ptr()];
            let _: () = msg_send![ud, setBool: Bool::YES, forKey: ns_key];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spellcheck_key_not_in_false_keys() {
        let target = c"WebContinuousSpellCheckingEnabled";
        assert!(
            !FALSE_KEYS.iter().any(|k| *k == target),
            "WebContinuousSpellCheckingEnabled must not appear in FALSE_KEYS"
        );
    }

    #[test]
    fn spellcheck_key_in_true_keys() {
        let target = c"WebContinuousSpellCheckingEnabled";
        assert!(
            TRUE_KEYS.iter().any(|k| *k == target),
            "WebContinuousSpellCheckingEnabled must appear in TRUE_KEYS"
        );
    }
}
