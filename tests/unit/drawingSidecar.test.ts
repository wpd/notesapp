// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect } from "vitest";
import {
  parseDrawingNumber,
  formatDrawingNumber,
  noteStem,
  drawingFilename,
} from "../../src/utils/drawingSidecar";

describe("drawingSidecar", () => {
  describe("parseDrawingNumber", () => {
    it("parses a valid 4-digit number", () => {
      expect(parseDrawingNumber("my-note", "my-note.0001.drawing")).toBe(1);
      expect(parseDrawingNumber("my-note", "my-note.0042.drawing")).toBe(42);
      expect(parseDrawingNumber("my-note", "my-note.9999.drawing")).toBe(9999);
    });

    it("returns null for wrong stem", () => {
      expect(parseDrawingNumber("my-note", "other.0001.drawing")).toBeNull();
    });

    it("returns null for wrong extension", () => {
      expect(parseDrawingNumber("my-note", "my-note.0001.txt")).toBeNull();
    });

    it("returns null for non-4-digit number", () => {
      expect(parseDrawingNumber("my-note", "my-note.001.drawing")).toBeNull();
      expect(parseDrawingNumber("my-note", "my-note.00001.drawing")).toBeNull();
    });

    it("returns null for non-digit middle", () => {
      expect(parseDrawingNumber("my-note", "my-note.abcd.drawing")).toBeNull();
    });

    it("returns null for .tmp suffix", () => {
      expect(parseDrawingNumber("my-note", "my-note.0001.drawing.tmp")).toBeNull();
    });
  });

  describe("formatDrawingNumber", () => {
    it("zero-pads to 4 digits", () => {
      expect(formatDrawingNumber(1)).toBe("0001");
      expect(formatDrawingNumber(42)).toBe("0042");
      expect(formatDrawingNumber(1000)).toBe("1000");
      expect(formatDrawingNumber(9999)).toBe("9999");
    });
  });

  describe("noteStem", () => {
    it("extracts the stem from a full path", () => {
      expect(noteStem("/path/to/notes/my-note.md")).toBe("my-note");
    });

    it("works with no directory", () => {
      expect(noteStem("my-note.md")).toBe("my-note");
    });

    it("handles multiple dots in name", () => {
      expect(noteStem("/notes/my.fancy.note.md")).toBe("my.fancy.note");
    });
  });

  describe("drawingFilename", () => {
    it("formats the correct filename", () => {
      expect(drawingFilename("my-note", 1)).toBe("my-note.0001.drawing");
      expect(drawingFilename("my-note", 42)).toBe("my-note.0042.drawing");
    });
  });
});
