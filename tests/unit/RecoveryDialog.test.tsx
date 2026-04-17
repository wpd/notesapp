// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecoveryDialog from "../../src/components/RecoveryDialog";

const invokeMock = (
  window as unknown as { __TAURI_INTERNALS__: { invoke: ReturnType<typeof vi.fn> } }
).__TAURI_INTERNALS__.invoke;

function setupInvokeRoutes(
  tmpContents: Record<string, string>,
): ReturnType<typeof vi.fn> {
  invokeMock.mockImplementation((cmd: string, args: Record<string, unknown>) => {
    if (cmd === "read_note") {
      const path = args.path as string;
      return Promise.resolve(tmpContents[path] ?? "");
    }
    if (cmd === "write_note") return Promise.resolve(undefined);
    if (cmd === "delete_tmp") return Promise.resolve(undefined);
    return Promise.resolve(undefined);
  });
  return invokeMock;
}

describe("RecoveryDialog", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it("returns null when there are no recoveries", () => {
    const { container } = render(
      <RecoveryDialog recoveries={[]} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the list of recovery items", () => {
    render(
      <RecoveryDialog
        recoveries={["/proj/notes/alpha.tmp", "/proj/notes/beta.tmp"]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("recovery-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("recovery-item-alpha")).toHaveTextContent("alpha");
    expect(screen.getByTestId("recovery-item-beta")).toHaveTextContent("beta");
  });

  it("pluralizes the count text", () => {
    render(
      <RecoveryDialog
        recoveries={["/proj/notes/solo.tmp"]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("recovery-dialog").textContent).toMatch(
      /1 note has an unsaved draft/,
    );
  });

  it("recovers all drafts: reads .tmp, writes to .md, deletes .tmp", async () => {
    setupInvokeRoutes({
      "/proj/notes/alpha.tmp": "alpha draft body",
      "/proj/notes/beta.tmp": "beta draft body",
    });
    const onClose = vi.fn();
    render(
      <RecoveryDialog
        recoveries={["/proj/notes/alpha.tmp", "/proj/notes/beta.tmp"]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("recovery-recover-button"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const calls = invokeMock.mock.calls;
    // alpha: read_note(tmp), write_note(md), delete_tmp(md)
    expect(calls).toEqual(
      expect.arrayContaining([
        ["read_note", { path: "/proj/notes/alpha.tmp" }, undefined],
        [
          "write_note",
          { path: "/proj/notes/alpha.md", content: "alpha draft body" },
          undefined,
        ],
        ["delete_tmp", { path: "/proj/notes/alpha.md" }, undefined],
        ["read_note", { path: "/proj/notes/beta.tmp" }, undefined],
        [
          "write_note",
          { path: "/proj/notes/beta.md", content: "beta draft body" },
          undefined,
        ],
        ["delete_tmp", { path: "/proj/notes/beta.md" }, undefined],
      ]),
    );
  });

  it("discards all drafts: calls delete_tmp but no write_note", async () => {
    setupInvokeRoutes({});
    const onClose = vi.fn();
    render(
      <RecoveryDialog
        recoveries={["/proj/notes/alpha.tmp"]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("recovery-discard-button"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const calls = invokeMock.mock.calls;
    expect(
      calls.some(([cmd]) => cmd === "write_note"),
    ).toBe(false);
    expect(
      calls.some(
        ([cmd, args]) =>
          cmd === "delete_tmp" &&
          (args as { path: string }).path === "/proj/notes/alpha.md",
      ),
    ).toBe(true);
  });

  it("surfaces an error if recovery fails", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "read_note") return Promise.reject(new Error("read failed"));
      return Promise.resolve(undefined);
    });
    const onClose = vi.fn();
    render(
      <RecoveryDialog
        recoveries={["/proj/notes/alpha.tmp"]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("recovery-recover-button"));
    await waitFor(() => {
      expect(screen.getByTestId("recovery-error")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
