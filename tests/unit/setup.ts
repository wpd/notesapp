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

// Stub ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Stub IntersectionObserver (not available in jsdom)
global.IntersectionObserver = class IntersectionObserver {
  constructor(_cb: unknown, _options?: unknown) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  get root() { return null; }
  get rootMargin() { return ''; }
  get thresholds() { return []; }
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;

// Stub window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
