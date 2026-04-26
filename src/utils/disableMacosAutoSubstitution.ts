// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { ViewPlugin } from "@codemirror/view";
import { EditorView } from "@codemirror/view";

// Single-character replacements that macOS WKWebView inserts via Smart Dashes,
// Smart Quotes, and Smart Ellipsis when autocorrect fires.
const MACOS_SUBSTITUTIONS = new Set([
  "\u2014", // — em dash  (from --)
  "\u2013", // – en dash
  "\u2018", // ' left single quote
  "\u2019", // ' right single quote / apostrophe
  "\u201C", // " left double quote
  "\u201D", // " right double quote
  "\u2026", // … ellipsis (from ...)
]);

// Intercept insertReplacementText events in capture phase so we fire before
// CodeMirror's own beforeinput handler, preventing the substitution at the
// DOM level regardless of system autocorrect settings.
class SubstitutionGuard {
  private readonly handler: (event: Event) => void;
  private readonly contentDOM: HTMLElement;
  constructor(view: EditorView) {
    this.contentDOM = view.contentDOM;
    this.handler = (event: Event) => {
      const ie = event as InputEvent;
      if (
        ie.inputType === "insertReplacementText" &&
        ie.data !== null &&
        MACOS_SUBSTITUTIONS.has(ie.data)
      ) {
        ie.preventDefault();
      }
    };
    this.contentDOM.addEventListener("beforeinput", this.handler, true);
  }
  destroy() {
    this.contentDOM.removeEventListener("beforeinput", this.handler, true);
  }
}

const substitutionGuard = ViewPlugin.fromClass(SubstitutionGuard);

// Exported as an array so callers spread it directly into their extensions list.
export const disableMacosAutoSubstitution = [
  // DOM attributes suppress OS-level autocorrect in WKWebView and other WebKit
  // hosts before any events fire. The beforeinput guard below is defense-in-depth.
  EditorView.contentAttributes.of({
    spellcheck: "true",
    autocorrect: "off",
    autocapitalize: "off",
    "data-gramm": "false",
  }),
  substitutionGuard,
];
