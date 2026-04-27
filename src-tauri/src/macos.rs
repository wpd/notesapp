// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

use objc2::runtime::{AnyObject, Bool};
use objc2::{class, msg_send};
use std::ffi::CStr;

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
