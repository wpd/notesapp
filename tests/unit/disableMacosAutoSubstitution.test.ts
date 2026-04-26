// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, afterEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { disableMacosAutoSubstitution } from "../../src/utils/disableMacosAutoSubstitution";

function makeView(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [...disableMacosAutoSubstitution],
  });
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

describe("disableMacosAutoSubstitution", () => {
  let view: EditorView;
  afterEach(() => {
    if (view) {
      view.destroy();
      view.dom.parentElement?.remove();
    }
  });

  describe("contentDOM attributes", () => {
    it("sets autocorrect=off", () => {
      view = makeView("");
      expect(view.contentDOM.getAttribute("autocorrect")).toBe("off");
    });

    it("sets autocapitalize=off", () => {
      view = makeView("");
      expect(view.contentDOM.getAttribute("autocapitalize")).toBe("off");
    });

    it("keeps spellcheck=true", () => {
      view = makeView("");
      expect(view.contentDOM.getAttribute("spellcheck")).toBe("true");
    });

    it("sets data-gramm=false to block Grammarly substitutions", () => {
      view = makeView("");
      expect(view.contentDOM.getAttribute("data-gramm")).toBe("false");
    });
  });

  describe("beforeinput guard", () => {
    it("cancels insertReplacementText for em dash", () => {
      view = makeView("-----");
      const event = new InputEvent("beforeinput", {
        inputType: "insertReplacementText",
        data: "\u2014", // em dash
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("cancels insertReplacementText for smart double quote", () => {
      view = makeView('"hello"');
      const event = new InputEvent("beforeinput", {
        inputType: "insertReplacementText",
        data: "\u201C", // left double quote
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("cancels insertReplacementText for ellipsis", () => {
      view = makeView("...");
      const event = new InputEvent("beforeinput", {
        inputType: "insertReplacementText",
        data: "\u2026", // ellipsis
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("does not cancel insertReplacementText for a normal word (spell-check replacement)", () => {
      view = makeView("teh");
      const event = new InputEvent("beforeinput", {
        inputType: "insertReplacementText",
        data: "the",
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it("does not cancel other input types", () => {
      view = makeView("hello");
      const event = new InputEvent("beforeinput", {
        inputType: "insertText",
        data: "\u2014",
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });
});
