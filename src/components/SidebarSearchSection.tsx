// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import useProjectStore from "../stores/projectStore";
import useLayoutStore from "../stores/layoutStore";

interface SearchHit {
  path: string;
  kind: string;
  title: string;
  snippet: string;
  score: number;
}

interface SidebarSearchSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function SidebarSearchSection({
  isOpen,
  onToggle,
}: SidebarSearchSectionProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectDir = useProjectStore((s) => s.projectDir);
  const focusRequest = useLayoutStore((s) => s.sidebarSearchFocusRequest);

  // Focus input whenever a search-focus request fires
  useEffect(() => {
    if (focusRequest > 0 && isOpen) {
      inputRef.current?.focus();
    }
  }, [focusRequest, isOpen]);

  // Debounced search (~200ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q || !projectDir) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      invoke<SearchHit[]>("search_project", { projectDir, query: q, limit: 30 })
        .then((hits) => { setResults(hits); setSearching(false); })
        .catch(() => { setResults([]); setSearching(false); });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, projectDir]);

  const handleHitClick = useCallback(
    (hit: SearchHit) => {
      const layout = useLayoutStore.getState();
      const focused = layout.focusedTileId;
      if (!focused) return;
      const newMode = hit.kind === "reference" ? "reference" : "editor";
      layout.setTileFile(focused, hit.path);
      if (newMode === "reference") {
        layout.setTileMode(focused, "reference");
      }
    },
    [],
  );

  return (
    <div data-testid="sidebar-search-section" style={{ flexShrink: 0 }}>
      {/* Section header */}
      <button
        data-testid="sidebar-search-toggle"
        onClick={onToggle}
        style={sectionHeaderStyle}
        aria-expanded={isOpen}
      >
        <span style={{ marginRight: "4px" }}>{isOpen ? "▾" : "▸"}</span>
        Search
      </button>

      {isOpen && (
        <div style={{ borderBottom: "1px solid var(--color-border)" }}>
          {/* Query input */}
          <div style={{ padding: "6px 8px" }}>
            <input
              ref={inputRef}
              data-testid="sidebar-search-input"
              type="text"
              placeholder="Search notes and references…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                padding: "4px 8px",
                fontFamily: "var(--font-prose)",
                fontSize: "12px",
                color: "var(--color-text-primary)",
                background: "var(--color-bg-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* Results */}
          <div
            data-testid="sidebar-search-results"
            style={{ maxHeight: "280px", overflowY: "auto" }}
          >
            {searching && (
              <div style={hintStyle}>Searching…</div>
            )}
            {!searching && query.trim() && results.length === 0 && (
              <div style={hintStyle}>No results.</div>
            )}
            {results.map((hit, i) => (
              <div
                key={`${hit.path}-${i}`}
                data-testid={`search-hit-${i}`}
                onClick={() => handleHitClick(hit)}
                style={hitItemStyle}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(0,0,0,0.05)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "transparent";
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-prose)",
                    fontSize: "12px",
                    color: "var(--color-text-primary)",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9px",
                      color: "var(--color-text-disabled)",
                      marginRight: "4px",
                      textTransform: "uppercase",
                    }}
                  >
                    {hit.kind}
                  </span>
                  {hit.title || hit.path.split("/").pop()}
                </div>
                {hit.snippet && (
                  <div
                    style={{
                      fontFamily: "var(--font-prose)",
                      fontSize: "11px",
                      color: "var(--color-text-secondary)",
                      marginTop: "2px",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {hit.snippet}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "6px 12px",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--color-border)",
  fontFamily: "var(--font-prose)",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  cursor: "pointer",
  textAlign: "left",
};

const hintStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontFamily: "var(--font-prose)",
  fontSize: "12px",
  color: "var(--color-text-disabled)",
  fontStyle: "italic",
};

const hitItemStyle: React.CSSProperties = {
  padding: "6px 12px",
  cursor: "pointer",
  borderBottom: "1px solid rgba(0,0,0,0.04)",
};
