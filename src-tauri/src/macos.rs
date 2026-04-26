// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

use objc2::{class, msg_send, msg_send_id};
use objc2::rc::Retained;
use objc2::runtime::AnyObject;

// Set both NS* and Web* variants: different WKWebView/WebKit versions read
// different key prefixes. Call this before tauri::Builder::default() so the
// values are in NSUserDefaults before any WKWebView reads them at init time.
//
// WebContinuousSpellCheckingEnabled is intentionally omitted — visual
// spellcheck (red underlines) stays on; only transformative substitutions
// are disabled.
pub fn disable_smart_substitutions() {
    unsafe {
        let ud: Retained<AnyObject> =
            msg_send_id![class!(NSUserDefaults), standardUserDefaults];
        let ud = &*ud;

        macro_rules! set_false {
            ($key:literal) => {
                let _: () = msg_send![
                    ud,
                    setBool: 0i8,
                    forKey: objc2_foundation::ns_string!($key)
                ];
            };
        }

        set_false!("NSAutomaticDashSubstitutionEnabled");
        set_false!("NSAutomaticQuoteSubstitutionEnabled");
        set_false!("NSAutomaticPeriodSubstitutionEnabled");
        set_false!("NSAutomaticTextReplacementEnabled");
        set_false!("NSAutomaticSpellingCorrectionEnabled");
        set_false!("WebAutomaticDashSubstitutionEnabled");
        set_false!("WebAutomaticQuoteSubstitutionEnabled");
        set_false!("WebAutomaticPeriodSubstitutionEnabled");
        set_false!("WebAutomaticTextReplacementEnabled");
        set_false!("WebAutomaticSpellingCorrectionEnabled");
    }
}
