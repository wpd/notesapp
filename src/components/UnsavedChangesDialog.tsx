// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import useLayoutStore, { PendingDialog } from "../stores/layoutStore";
import useEditorStore from "../stores/editorStore";

function clearDirtyForFile(filePath: string): void {
  const boundTileIds = Object.values(useLayoutStore.getState().tiles)
    .filter((t) => t.filePath === filePath || t.missingPath === filePath)
    .map((t) => t.id);
  for (const id of boundTileIds) {
    useEditorStore.getState().setDirty(id, false);
  }
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

async function saveOne(tileId: string, filePath: string): Promise<void> {
  await useEditorStore.getState().saveFile(tileId, filePath);
}

async function discardOne(filePath: string): Promise<void> {
  try {
    await invoke("delete_tmp", { path: filePath });
  } catch {
    // Non-fatal
  }
}

export default function UnsavedChangesDialog(): React.ReactElement | null {
  const pending = useLayoutStore((s) => s.pendingDialog);
  const setPendingDialog = useLayoutStore((s) => s.setPendingDialog);
  const closeTile = useLayoutStore((s) => s.closeTile);
  const setTileFile = useLayoutStore((s) => s.setTileFile);
  const setTileMode = useLayoutStore((s) => s.setTileMode);

  if (!pending) return null;

  if (pending.kind === "quit") {
    return (
      <QuitDialog
        pending={pending}
        onDismiss={() => setPendingDialog(null)}
      />
    );
  }

  if (pending.kind === "missing-recovery") {
    return (
      <MissingRecoveryDialog
        pending={pending}
        onDismiss={() => setPendingDialog(null)}
      />
    );
  }

  const tileId = pending.tileId;
  const filePath =
    pending.kind === "close" ? pending.filePath : pending.oldFilePath;

  const handleCancel = () => {
    setPendingDialog(null);
  };

  const applyIntent = () => {
    if (pending.kind === "close") {
      closeTile(tileId);
    } else {
      if (pending.newMode) setTileMode(tileId, pending.newMode);
      setTileFile(tileId, pending.newFilePath);
    }
    setPendingDialog(null);
  };

  const handleSave = async () => {
    try {
      await saveOne(tileId, filePath);
    } catch {
      // Leave dialog open on failure — user can retry or cancel.
      return;
    }
    applyIntent();
  };

  const handleDiscard = async () => {
    await discardOne(filePath);
    clearDirtyForFile(filePath);
    applyIntent();
  };

  return (
    <div data-testid="unsaved-dialog-overlay" style={overlayStyle}>
      <div
        data-testid="unsaved-dialog"
        role="dialog"
        aria-labelledby="unsaved-dialog-title"
        style={dialogStyle}
      >
        <h2 id="unsaved-dialog-title" style={titleStyle}>
          Unsaved changes
        </h2>
        <p style={bodyStyle}>
          <code style={codeStyle}>{basename(filePath)}</code> has unsaved
          changes. Save before closing?
        </p>
        <div style={buttonsStyle}>
          <button
            data-testid="unsaved-dialog-cancel"
            onClick={handleCancel}
            style={buttonStyle("secondary")}
          >
            Cancel
          </button>
          <button
            data-testid="unsaved-dialog-discard"
            onClick={() => void handleDiscard()}
            style={buttonStyle("secondary")}
          >
            Discard
          </button>
          <button
            data-testid="unsaved-dialog-save"
            onClick={() => void handleSave()}
            style={buttonStyle("primary")}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Missing-recovery confirmation — SPEC.md §5.5
// Continue/Cancel only. No Save: the underlying file is gone.
// ---------------------------------------------------------------------------

interface MissingRecoveryDialogProps {
  pending: Extract<PendingDialog, { kind: "missing-recovery" }>;
  onDismiss: () => void;
}

function MissingRecoveryDialog({
  pending,
  onDismiss,
}: MissingRecoveryDialogProps): React.ReactElement {
  const verb = pending.action === "close" ? "close" : "open a different buffer";
  const handleContinue = () => {
    if (pending.missingPath) clearDirtyForFile(pending.missingPath);
    pending.onContinue();
    onDismiss();
  };
  return (
    <div data-testid="missing-recovery-overlay" style={overlayStyle}>
      <div
        data-testid="missing-recovery-dialog"
        role="dialog"
        aria-labelledby="missing-recovery-title"
        style={dialogStyle}
      >
        <h2 id="missing-recovery-title" style={titleStyle}>
          Discard unsaved changes?
        </h2>
        <p style={bodyStyle}>
          The file{" "}
          <code style={codeStyle}>{basename(pending.missingPath)}</code> no
          longer exists, but this tile still has unsaved in-memory changes.
          Continue to {verb} and discard them?
        </p>
        <div style={buttonsStyle}>
          <button
            data-testid="missing-recovery-cancel"
            onClick={onDismiss}
            style={buttonStyle("secondary")}
          >
            Cancel
          </button>
          <button
            data-testid="missing-recovery-continue"
            onClick={handleContinue}
            style={buttonStyle("primary")}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consolidated quit dialog — SPEC.md §4.0.1
// ---------------------------------------------------------------------------

interface QuitDialogProps {
  pending: Extract<PendingDialog, { kind: "quit" }>;
  onDismiss: () => void;
}

function QuitDialog({
  pending,
  onDismiss,
}: QuitDialogProps): React.ReactElement {
  // Per-buffer intent: true = Save, false = Discard
  const [saveMap, setSaveMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const b of pending.dirtyBuffers) m[b.filePath] = true;
    return m;
  });

  const toggle = (filePath: string) => {
    setSaveMap((m) => ({ ...m, [filePath]: !m[filePath] }));
  };

  const handleConfirm = useCallback(async () => {
    for (const buf of pending.dirtyBuffers) {
      if (saveMap[buf.filePath]) {
        try {
          await saveOne(buf.representativeTileId, buf.filePath);
        } catch {
          // Leave dialog open on failure
          return;
        }
      } else {
        await discardOne(buf.filePath);
        clearDirtyForFile(buf.filePath);
      }
    }
    pending.onComplete?.();
    onDismiss();
  }, [pending, saveMap, onDismiss]);

  return (
    <div data-testid="quit-dialog-overlay" style={overlayStyle}>
      <div
        data-testid="quit-dialog"
        role="dialog"
        aria-labelledby="quit-dialog-title"
        style={dialogStyle}
      >
        <h2 id="quit-dialog-title" style={titleStyle}>
          Unsaved changes
        </h2>
        <p style={bodyStyle}>
          The following buffers have unsaved changes. Choose what to do
          with each:
        </p>
        <ul
          data-testid="quit-dialog-list"
          style={{
            listStyle: "none",
            padding: 0,
            margin: "0.5rem 0 1rem 0",
            maxHeight: "40vh",
            overflow: "auto",
          }}
        >
          {pending.dirtyBuffers.map((buf) => (
            <li
              key={buf.filePath}
              data-testid={`quit-dialog-item-${basename(buf.filePath)}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flex: 1,
                }}
              >
                <input
                  type="checkbox"
                  data-testid={`quit-dialog-save-${basename(buf.filePath)}`}
                  checked={saveMap[buf.filePath] ?? true}
                  onChange={() => toggle(buf.filePath)}
                />
                <span
                  style={{
                    fontFamily: "var(--font-prose)",
                    fontSize: "13px",
                    color: "var(--color-text-primary)",
                  }}
                >
                  Save <code style={codeStyle}>{basename(buf.filePath)}</code>
                </span>
              </label>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                  fontFamily: "var(--font-prose)",
                }}
              >
                {saveMap[buf.filePath] ? "Save" : "Discard"}
              </span>
            </li>
          ))}
        </ul>
        <div style={buttonsStyle}>
          <button
            data-testid="quit-dialog-cancel"
            onClick={onDismiss}
            style={buttonStyle("secondary")}
          >
            Cancel
          </button>
          <button
            data-testid="quit-dialog-confirm"
            onClick={() => void handleConfirm()}
            style={buttonStyle("primary")}
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 1100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const dialogStyle: React.CSSProperties = {
  background: "var(--color-bg-overlay)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  width: "440px",
  maxWidth: "90vw",
  padding: "1.25rem 1.5rem",
  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
  fontFamily: "var(--font-prose)",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-prose)",
  fontSize: "16px",
  fontWeight: 600,
  color: "var(--color-text-primary)",
  margin: "0 0 0.5rem 0",
};

const bodyStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--color-text-secondary)",
  lineHeight: 1.4,
  margin: "0 0 1rem 0",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-editor)",
  fontSize: "12px",
  padding: "1px 5px",
  borderRadius: "3px",
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
};

const buttonsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
};

function buttonStyle(variant: "primary" | "secondary"): React.CSSProperties {
  return {
    padding: "6px 14px",
    border: variant === "primary" ? "none" : "1px solid var(--color-border)",
    borderRadius: "6px",
    background:
      variant === "primary" ? "var(--color-accent)" : "var(--color-bg-overlay)",
    color: variant === "primary" ? "#fff" : "var(--color-text-primary)",
    fontSize: "13px",
    fontFamily: "var(--font-prose)",
    cursor: "pointer",
  };
}
