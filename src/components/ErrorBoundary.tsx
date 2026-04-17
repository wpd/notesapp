// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";

interface Props {
  children: React.ReactNode;
  tileId?: string;
}

interface State {
  hasError: boolean;
  error: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(
      "[ErrorBoundary] Tile error:",
      error,
      info.componentStack,
    );
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid={`error-boundary-${this.props.tileId ?? "unknown"}`}
          style={{
            padding: "1rem",
            color: "var(--color-error)",
            background: "var(--color-bg-overlay)",
            border: "1px solid var(--color-error)",
            borderRadius: "4px",
            margin: "0.5rem",
            fontFamily: "var(--font-prose)",
            fontSize: "var(--font-size-prose-default)",
          }}
        >
          <strong>Tile error</strong>
          <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "12px" }}>
            {this.state.error}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: "0.5rem",
              padding: "0.25rem 0.75rem",
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
