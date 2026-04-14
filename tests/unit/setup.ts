// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import "@testing-library/jest-dom";

// Stub the Tauri IPC bridge so unit tests run in jsdom without a native host.
Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: {
    invoke: vi.fn().mockResolvedValue(undefined),
    transformCallback: vi.fn(),
    ipc: vi.fn(),
  },
  writable: true,
});
