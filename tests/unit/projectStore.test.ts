// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import { describe, it, expect, beforeEach, vi } from "vitest";
import useProjectStore from "../../src/stores/projectStore";

const invokeMock = (
  window as unknown as { __TAURI_INTERNALS__: { invoke: ReturnType<typeof vi.fn> } }
).__TAURI_INTERNALS__.invoke;

beforeEach(() => {
  invokeMock.mockReset();
  useProjectStore.setState({
    projectDir: null,
    notes: [],
    isLoaded: false,
    error: null,
  });
});

describe("projectStore.setProjectDir (ROADMAP §Phase 1 chooser-result reprocessing)", () => {
  it("returns true and stores notes when open_project succeeds", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "open_project") {
        return Promise.resolve([
          { path: "/p/notes/a.md", name: "a", modified_at: 1 },
        ]);
      }
      return Promise.resolve(null);
    });
    const ok = await useProjectStore.getState().setProjectDir("/p");
    expect(ok).toBe(true);
    const s = useProjectStore.getState();
    expect(s.projectDir).toBe("/p");
    expect(s.isLoaded).toBe(true);
    expect(s.error).toBeNull();
    expect(s.notes).toHaveLength(1);
  });

  it("returns false and records the error reason when open_project rejects", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "open_project") {
        return Promise.reject(
          "project.toml is malformed: unexpected character",
        );
      }
      return Promise.resolve(null);
    });
    const ok = await useProjectStore.getState().setProjectDir("/broken");
    expect(ok).toBe(false);
    const s = useProjectStore.getState();
    expect(s.projectDir).toBeNull();
    expect(s.isLoaded).toBe(false);
    expect(s.error).toContain("malformed");
  });

  it("clears prior project state on a failed re-pick", async () => {
    // First pick: success
    invokeMock.mockImplementationOnce(() =>
      Promise.resolve([{ path: "/old/notes/x.md", name: "x", modified_at: 0 }]),
    );
    const ok1 = await useProjectStore.getState().setProjectDir("/old");
    expect(ok1).toBe(true);
    expect(useProjectStore.getState().projectDir).toBe("/old");

    // Second pick: failure — store must reset, not leave stale projectDir
    invokeMock.mockImplementationOnce(() =>
      Promise.reject("not a directory: /etc/passwd"),
    );
    const ok2 = await useProjectStore.getState().setProjectDir("/etc/passwd");
    expect(ok2).toBe(false);
    const s = useProjectStore.getState();
    expect(s.projectDir).toBeNull();
    expect(s.notes).toHaveLength(0);
    expect(s.error).toContain("not a directory");
  });
});
