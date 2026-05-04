// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Utilities for working with Excalidraw drawing sidecar paths.
 *
 * Sidecar naming: `<note-stem>.NNNN.drawing`  (4-digit zero-padded NNNN).
 * The note path is the full path to the `.md` file.
 */

/**
 * Parse the NNNN number from a sidecar filename.
 * Returns null if the filename doesn't match the pattern.
 */
export function parseDrawingNumber(
  noteStem: string,
  filename: string,
): number | null {
  const prefix = `${noteStem}.`;
  const suffix = ".drawing";
  if (!filename.startsWith(prefix) || !filename.endsWith(suffix)) return null;
  const middle = filename.slice(prefix.length, filename.length - suffix.length);
  if (middle.length !== 4 || !/^\d{4}$/.test(middle)) return null;
  return parseInt(middle, 10);
}

/** Format a 4-digit zero-padded NNNN string. */
export function formatDrawingNumber(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Derive the note stem from a full note path.
 * e.g. "/notes/my-note.md" → "my-note"
 */
export function noteStem(notePath: string): string {
  const base = notePath.split("/").pop() ?? notePath;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Build the sidecar filename (basename only) for a given note stem + number.
 * e.g. ("my-note", 3) → "my-note.0003.drawing"
 */
export function drawingFilename(stem: string, n: number): string {
  return `${stem}.${formatDrawingNumber(n)}.drawing`;
}
