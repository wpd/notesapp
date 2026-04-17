// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface RecoveryDialogProps {
  /** Absolute paths to `.tmp` autosave files whose `.md` sibling still exists. */
  recoveries: string[];
  onClose: () => void;
}

/** Derive the sibling `.md` path from a `.tmp` autosave path. */
function mdPathFromTmp(tmpPath: string): string {
  return tmpPath.replace(/\.tmp$/, ".md");
}

/** Human-friendly label: just the file basename without the `.tmp` suffix. */
function baseName(tmpPath: string): string {
  const withoutExt = tmpPath.replace(/\.tmp$/, "");
  const idx = Math.max(
    withoutExt.lastIndexOf("/"),
    withoutExt.lastIndexOf("\\"),
  );
  return idx >= 0 ? withoutExt.slice(idx + 1) : withoutExt;
}

export default function RecoveryDialog({
  recoveries,
  onClose,
}: RecoveryDialogProps): React.ReactElement | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (recoveries.length === 0) return null;

  const handleRecover = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      for (const tmpPath of recoveries) {
        const mdPath = mdPathFromTmp(tmpPath);
        const content = await invoke<string>("read_note", { path: tmpPath });
        await invoke("write_note", { path: mdPath, content });
        await invoke("delete_tmp", { path: mdPath });
      }
      onClose();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  const handleDiscard = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      for (const tmpPath of recoveries) {
        const mdPath = mdPathFromTmp(tmpPath);
        await invoke("delete_tmp", { path: mdPath });
      }
      onClose();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="recovery-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-dialog-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: "var(--font-prose)",
      }}
    >
      <div
        data-testid="recovery-dialog"
        style={{
          background: "var(--color-bg-overlay)",
          color: "var(--color-text-primary)",
          borderRadius: "8px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          padding: "1.5rem",
          width: "min(540px, 92vw)",
          maxHeight: "80vh",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2
          id="recovery-dialog-title"
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 600,
          }}
        >
          Unsaved drafts recovered
        </h2>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {recoveries.length === 1
            ? "1 note has an unsaved draft from a previous session."
            : `${recoveries.length} notes have unsaved drafts from a previous session.`}
          {" "}
          Recover them to overwrite the saved versions, or discard to keep the
          saved versions.
        </p>

        <ul
          data-testid="recovery-list"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            border: "1px solid var(--color-border)",
            borderRadius: "4px",
            maxHeight: "200px",
            overflow: "auto",
          }}
        >
          {recoveries.map((tmpPath) => (
            <li
              key={tmpPath}
              data-testid={`recovery-item-${baseName(tmpPath)}`}
              style={{
                padding: "0.5rem 0.75rem",
                borderBottom: "1px solid var(--color-border)",
                fontFamily: "var(--font-editor)",
                fontSize: "13px",
              }}
            >
              {baseName(tmpPath)}
            </li>
          ))}
        </ul>

        {error && (
          <p
            data-testid="recovery-error"
            style={{
              margin: 0,
              color: "var(--color-error)",
              fontSize: "13px",
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            justifyContent: "flex-end",
          }}
        >
          <button
            data-testid="recovery-discard-button"
            onClick={handleDiscard}
            disabled={busy}
            style={{
              padding: "0.5rem 1rem",
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "var(--font-prose)",
            }}
          >
            Discard drafts
          </button>
          <button
            data-testid="recovery-recover-button"
            onClick={handleRecover}
            disabled={busy}
            style={{
              padding: "0.5rem 1rem",
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "var(--font-prose)",
            }}
          >
            Recover drafts
          </button>
        </div>
      </div>
    </div>
  );
}
