// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

use objc2::runtime::AnyObject;
use objc2::{class, msg_send};
use std::ffi::CStr;

// Set both NS* and Web* variants: different WKWebView/WebKit versions read
// different key prefixes. Call this before tauri::Builder::default() so the
// values are in NSUserDefaults before any WKWebView reads them at init time.
//
// WebContinuousSpellCheckingEnabled is intentionally omitted — visual
// spellcheck (red underlines) stays on; only transformative substitutions
// are disabled.
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

pub fn disable_smart_substitutions() {
    unsafe {
        let ud: *mut AnyObject =
            msg_send![class!(NSUserDefaults), standardUserDefaults];
        let nsstring_cls = class!(NSString);
        for key in FALSE_KEYS {
            let ns_key: *mut AnyObject =
                msg_send![nsstring_cls, stringWithUTF8String: key.as_ptr()];
            let _: () = msg_send![ud, setBool: 0i8, forKey: ns_key];
        }
    }
}
