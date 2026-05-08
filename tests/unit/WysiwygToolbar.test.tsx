// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Unit tests for WysiwygToolbar (ISSUE-011).
 *
 * Verifies that each toolbar button invokes the expected Tiptap chain command
 * and that the Insert-Drawing button calls the `next_drawing_number` Tauri
 * command before inserting the drawingBlock node.
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WysiwygToolbar from "../../src/components/WysiwygToolbar";
import useLayoutStore from "../../src/stores/layoutStore";
import * as tauriCore from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Mock Tiptap editor — captures chain() calls via a fluent Proxy so we can
// assert which commands were ultimately called via .run().
// ---------------------------------------------------------------------------

function makeEditorMock() {
  const calls: string[] = [];
  const run = vi.fn().mockReturnValue(true);

  // Build a proxy that records every method name accessed after chain().focus()
  // and returns itself so chaining works indefinitely.
  const chainProxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "run") return run;
        return (...args: unknown[]) => {
          calls.push(prop);
          if (args.length) calls.push(JSON.stringify(args[0]));
          return chainProxy;
        };
      },
    },
  );

  const canProxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        // table buttons query can().addRowAfter() etc. — return a fn that returns true.
        return () => (prop === "deleteTable" ? false : true);
      },
    },
  );

  const editor = {
    chain: vi.fn().mockReturnValue(chainProxy),
    isActive: vi.fn().mockReturnValue(false),
    can: vi.fn().mockReturnValue(canProxy),
    getAttributes: vi.fn().mockReturnValue({ href: "" }),
    commands: {},
  };

  return { editor, calls, run };
}

// Seed a tile in the layout store so insertDrawing can read the filePath.
function seedPreviewTile(tileId = "tile-p", filePath = "/notes/test.md") {
  useLayoutStore.setState({
    mosaicTree: null,
    tiles: { [tileId]: { id: tileId, mode: "preview", filePath } },
    focusedTileId: tileId,
    pinnedTileId: null,
    sidebarVisible: true,
    maximizedTileId: null,
    savedTreeBeforeMaximize: null,
    tileCounter: 0,
    pendingDialog: null,
    cxPrefixActive: false,
    wordWrap: {},
    tileFontScale: {},
  });
}

describe("WysiwygToolbar — renders placeholder when editor is null", () => {
  it("renders an empty placeholder div (no toolbar buttons)", () => {
    const { container } = render(
      <WysiwygToolbar editor={null} tileId="tile-p" />,
    );
    expect(container.querySelector("[data-testid='wysiwyg-toolbar']")).toBeNull();
    // The placeholder is a 32px-tall empty div.
    const div = container.querySelector("div");
    expect(div).not.toBeNull();
  });
});

describe("WysiwygToolbar — renders all buttons when editor is provided", () => {
  it("renders the toolbar root element", () => {
    const { editor } = makeEditorMock();
    seedPreviewTile();
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );
    expect(screen.getByTestId("wysiwyg-toolbar")).toBeInTheDocument();
  });

  it("renders Bold, Italic, Underline, Strikethrough, Code buttons", () => {
    const { editor } = makeEditorMock();
    seedPreviewTile();
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );
    expect(screen.getByTitle("Bold (Mod+B)")).toBeInTheDocument();
    expect(screen.getByTitle("Italic (Mod+I)")).toBeInTheDocument();
    expect(screen.getByTitle("Underline (Mod+U)")).toBeInTheDocument();
    expect(screen.getByTitle("Strikethrough")).toBeInTheDocument();
    expect(screen.getByTitle("Inline code")).toBeInTheDocument();
  });

  it("renders heading buttons H1–H4", () => {
    const { editor } = makeEditorMock();
    seedPreviewTile();
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );
    for (const level of [1, 2, 3, 4]) {
      expect(screen.getByTitle(`Heading ${level}`)).toBeInTheDocument();
    }
  });

  it("renders block-element buttons", () => {
    const { editor } = makeEditorMock();
    seedPreviewTile();
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );
    expect(screen.getByTitle("Blockquote")).toBeInTheDocument();
    expect(screen.getByTitle("Bullet list")).toBeInTheDocument();
    expect(screen.getByTitle("Ordered list")).toBeInTheDocument();
    expect(screen.getByTitle("Task list")).toBeInTheDocument();
    expect(screen.getByTitle("Horizontal rule")).toBeInTheDocument();
  });

  it("renders table and drawing buttons", () => {
    const { editor } = makeEditorMock();
    seedPreviewTile();
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );
    expect(screen.getByTitle("Insert table")).toBeInTheDocument();
    expect(screen.getByTitle("Insert drawing (C-c d)")).toBeInTheDocument();
  });
});

describe("WysiwygToolbar — inline mark buttons call the expected chain command", () => {
  let editor: ReturnType<typeof makeEditorMock>["editor"];
  let calls: string[];
  let run: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = makeEditorMock();
    editor = mock.editor;
    calls = mock.calls;
    run = mock.run;
    seedPreviewTile();
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );
  });

  it("Bold button calls toggleBold", () => {
    fireEvent.click(screen.getByTitle("Bold (Mod+B)"));
    expect(calls).toContain("toggleBold");
    expect(run).toHaveBeenCalled();
  });

  it("Italic button calls toggleItalic", () => {
    fireEvent.click(screen.getByTitle("Italic (Mod+I)"));
    expect(calls).toContain("toggleItalic");
    expect(run).toHaveBeenCalled();
  });

  it("Underline button calls toggleUnderline", () => {
    fireEvent.click(screen.getByTitle("Underline (Mod+U)"));
    expect(calls).toContain("toggleUnderline");
    expect(run).toHaveBeenCalled();
  });

  it("Strikethrough button calls toggleStrike", () => {
    fireEvent.click(screen.getByTitle("Strikethrough"));
    expect(calls).toContain("toggleStrike");
    expect(run).toHaveBeenCalled();
  });

  it("Code button calls toggleCode", () => {
    fireEvent.click(screen.getByTitle("Inline code"));
    expect(calls).toContain("toggleCode");
    expect(run).toHaveBeenCalled();
  });

  it("H1 button calls toggleHeading", () => {
    fireEvent.click(screen.getByTitle("Heading 1"));
    expect(calls).toContain("toggleHeading");
    expect(run).toHaveBeenCalled();
  });

  it("H4 button calls toggleHeading", () => {
    fireEvent.click(screen.getByTitle("Heading 4"));
    expect(calls).toContain("toggleHeading");
    expect(run).toHaveBeenCalled();
  });

  it("Blockquote button calls toggleBlockquote", () => {
    fireEvent.click(screen.getByTitle("Blockquote"));
    expect(calls).toContain("toggleBlockquote");
    expect(run).toHaveBeenCalled();
  });

  it("Bullet list button calls toggleBulletList", () => {
    fireEvent.click(screen.getByTitle("Bullet list"));
    expect(calls).toContain("toggleBulletList");
    expect(run).toHaveBeenCalled();
  });

  it("Ordered list button calls toggleOrderedList", () => {
    fireEvent.click(screen.getByTitle("Ordered list"));
    expect(calls).toContain("toggleOrderedList");
    expect(run).toHaveBeenCalled();
  });

  it("Task list button calls toggleTaskList", () => {
    fireEvent.click(screen.getByTitle("Task list"));
    expect(calls).toContain("toggleTaskList");
    expect(run).toHaveBeenCalled();
  });

  it("Horizontal rule button calls setHorizontalRule", () => {
    fireEvent.click(screen.getByTitle("Horizontal rule"));
    expect(calls).toContain("setHorizontalRule");
    expect(run).toHaveBeenCalled();
  });

  it("Insert table button calls insertTable", () => {
    fireEvent.click(screen.getByTitle("Insert table"));
    expect(calls).toContain("insertTable");
    expect(run).toHaveBeenCalled();
  });

  it("Undo button calls undo", () => {
    fireEvent.click(screen.getByTitle("Undo"));
    expect(calls).toContain("undo");
    expect(run).toHaveBeenCalled();
  });

  it("Redo button calls redo", () => {
    fireEvent.click(screen.getByTitle("Redo"));
    expect(calls).toContain("redo");
    expect(run).toHaveBeenCalled();
  });
});

describe("WysiwygToolbar — Insert Drawing button calls next_drawing_number", () => {
  const invokeStub = tauriCore.invoke as ReturnType<typeof vi.fn>;

  it("calls invoke(next_drawing_number) with the tile's notePath then inserts drawingBlock", async () => {
    const { editor } = makeEditorMock();
    const insertContentMock = vi.fn().mockReturnValue({ run: vi.fn() });
    const chainMock = {
      focus: vi.fn(),
      insertContent: insertContentMock,
    };
    chainMock.focus.mockReturnValue(chainMock);
    editor.chain.mockReturnValue(chainMock);

    invokeStub.mockImplementation((cmd: string) =>
      cmd === "next_drawing_number" ? Promise.resolve(3) : Promise.resolve(null),
    );

    seedPreviewTile("tile-p", "/notes/my-note.md");
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );

    fireEvent.click(screen.getByTitle("Insert drawing (C-c d)"));

    // Allow the async invoke promise to settle.
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(invokeStub).toHaveBeenCalledWith("next_drawing_number", {
      notePath: "/notes/my-note.md",
    });
    expect(insertContentMock).toHaveBeenCalledWith({
      type: "drawingBlock",
      attrs: { filename: "my-note.0003.drawing" },
    });
  });

  it("does nothing when editor is null", () => {
    render(<WysiwygToolbar editor={null} tileId="tile-p" />);
    // No toolbar rendered, no buttons to click — just verify no crash.
    expect(screen.queryByTitle("Insert drawing (C-c d)")).toBeNull();
  });
});

describe("WysiwygToolbar — Link button calls setLink", () => {
  it("calls unsetLink when user enters an empty URL", () => {
    const { editor, calls, run } = makeEditorMock();
    seedPreviewTile();
    vi.spyOn(window, "prompt").mockReturnValue("");
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );

    fireEvent.click(screen.getByTitle("Link"));
    expect(calls).toContain("unsetLink");
    expect(run).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("calls setLink when user enters a URL", () => {
    const { editor, calls, run } = makeEditorMock();
    seedPreviewTile();
    vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );

    fireEvent.click(screen.getByTitle("Link"));
    expect(calls).toContain("setLink");
    expect(run).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("does nothing when user cancels the prompt (returns null)", () => {
    const { editor, run } = makeEditorMock();
    seedPreviewTile();
    vi.spyOn(window, "prompt").mockReturnValue(null);
    render(
      <WysiwygToolbar
        editor={editor as unknown as ReturnType<typeof import("@tiptap/react").useEditor>}
        tileId="tile-p"
      />,
    );

    fireEvent.click(screen.getByTitle("Link"));
    expect(run).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
