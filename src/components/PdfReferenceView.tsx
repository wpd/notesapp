// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * PDF viewer for Reference tiles (SPEC.md §5.3).
 *
 * Uses the pdfjs-dist programmatic API with a canvas-per-page renderer.
 * A transparent text-layer <div> over the canvas enables text selection
 * and the right-click context menu.
 *
 * Page number and zoom are persisted to layoutStore so they survive an
 * app restart.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import useLayoutStore from "../stores/layoutStore";
import ReferenceContextMenu, { SelectionInfo } from "./ReferenceContextMenu";

interface PdfReferenceViewProps {
  tileId: string;
  filePath: string;
}

interface PdfModule {
  getDocument: (params: { url: string }) => { promise: Promise<PdfDocProxy> };
  GlobalWorkerOptions: { workerSrc: string };
}

interface PdfDocProxy {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageProxy>;
  destroy: () => void;
}

interface PdfPageProxy {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void> };
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
}

interface PdfViewport {
  width: number;
  height: number;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

export default function PdfReferenceView({
  tileId,
  filePath,
}: PdfReferenceViewProps): React.ReactElement {
  const pdfState = useLayoutStore((s) => s.tiles[tileId]?.pdfState);
  const { setTilePdfState } = useLayoutStore();

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(pdfState?.page ?? 1);
  const [zoom, setZoom] = useState(pdfState?.zoom ?? 1.0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selection: SelectionInfo;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PdfDocProxy | null>(null);
  const pdfModuleRef = useRef<PdfModule | null>(null);
  const renderTaskRef = useRef<{ promise: Promise<void> } | null>(null);

  // Persist page + zoom to layout store whenever they change
  useEffect(() => {
    setTilePdfState(tileId, { page: currentPage, zoom });
  }, [tileId, currentPage, zoom, setTilePdfState]);

  // Load the PDF document when filePath changes
  useEffect(() => {
    let active = true;
    setLoadError(null);

    async function loadDoc() {
      // Lazy-load pdfjs-dist to keep the initial bundle smaller
      if (!pdfModuleRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import("pdfjs-dist")) as any as PdfModule;
        mod.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        pdfModuleRef.current = mod;
      }

      // Destroy any previously loaded document
      if (docRef.current) {
        docRef.current.destroy();
        docRef.current = null;
      }

      // Convert the filesystem path to a URL that the Tauri asset protocol
      // can serve. On Linux/macOS: file:///abs/path
      const fileUrl = filePath.startsWith("/")
        ? `asset://localhost${filePath}`
        : filePath;

      try {
        const loadingTask = pdfModuleRef.current.getDocument({ url: fileUrl });
        const doc = await loadingTask.promise;
        if (!active) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        // Clamp currentPage to valid range for the new document
        setCurrentPage((p) => Math.min(Math.max(1, p), doc.numPages));
      } catch (err) {
        if (active) {
          setLoadError(String(err));
        }
      }
    }

    void loadDoc();
    return () => {
      active = false;
    };
  }, [filePath]);

  // Render the current page to canvas whenever currentPage/zoom/doc changes
  useEffect(() => {
    if (!docRef.current || !canvasRef.current) return;

    async function renderPage() {
      const doc = docRef.current;
      if (!doc) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const page = await doc.getPage(currentPage);
      const viewport = page.getViewport({ scale: zoom });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Cancel any in-flight render before starting a new one
      renderTaskRef.current = page.render({ canvasContext: ctx, viewport });
      try {
        await renderTaskRef.current.promise;
      } catch {
        // Cancelled render — normal on rapid page/zoom changes
        return;
      }

      // Build a simple text layer for selection
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = "";
        const textContent = await page.getTextContent();
        textLayerRef.current.style.width = `${viewport.width}px`;
        textLayerRef.current.style.height = `${viewport.height}px`;
        for (const item of textContent.items) {
          const span = document.createElement("span");
          span.textContent = item.str;
          // Position the span using the PDF transform matrix
          const tx = item.transform;
          const left = tx[4];
          const top = viewport.height - tx[5] - item.height;
          span.style.cssText = `position:absolute;left:${left}px;top:${top}px;font-size:${item.height}px;white-space:pre;opacity:0;`;
          textLayerRef.current.appendChild(span);
        }
      }
    }

    void renderPage();
  }, [currentPage, zoom, numPages]);

  const goTo = useCallback(
    (page: number) => setCurrentPage(Math.min(Math.max(1, page), numPages)),
    [numPages],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "n" || e.key === "PageDown") goTo(currentPage + 1);
      else if (e.key === "p" || e.key === "PageUp") goTo(currentPage - 1);
      else if ((e.metaKey || e.ctrlKey) && e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(z + 0.25, 4));
      } else if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(z - 0.25, 0.25));
      } else if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        setZoom(1.0);
      }
    },
    [currentPage, goTo],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const text = window.getSelection()?.toString().trim() ?? "";
      if (!text) return;
      e.preventDefault();
      const filename = filePath.split("/").pop() ?? filePath;
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selection: { text, filename, filePath, page: currentPage },
      });
    },
    [filePath, currentPage],
  );

  if (loadError) {
    return (
      <div
        data-testid="pdf-reference-error"
        style={{
          padding: "2rem",
          color: "var(--color-error, #dc2626)",
          fontFamily: "var(--font-prose)",
        }}
      >
        [PDF load error: {loadError}]
      </div>
    );
  }

  return (
    <div
      data-testid="pdf-reference-view"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Navigation toolbar */}
      <div
        data-testid="pdf-nav-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 12px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg-secondary)",
          fontFamily: "var(--font-prose)",
          fontSize: "12px",
          color: "var(--color-text-secondary)",
          flexShrink: 0,
        }}
      >
        <button
          data-testid="pdf-prev-page"
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage <= 1}
          style={navBtnStyle}
          aria-label="Previous page"
        >
          ◀
        </button>
        <span data-testid="pdf-page-indicator">
          {numPages > 0 ? `${currentPage} / ${numPages}` : "—"}
        </span>
        <button
          data-testid="pdf-next-page"
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage >= numPages}
          style={navBtnStyle}
          aria-label="Next page"
        >
          ▶
        </button>
        <span style={{ margin: "0 4px", color: "var(--color-border)" }}>|</span>
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
          style={navBtnStyle}
          aria-label="Zoom out"
        >
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
          style={navBtnStyle}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setZoom(1.0)}
          style={{ ...navBtnStyle, marginLeft: "2px" }}
          aria-label="Reset zoom"
        >
          ⌂
        </button>
      </div>

      {/* Canvas + text layer */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--color-bg-secondary)",
          display: "flex",
          justifyContent: "center",
          padding: "1rem",
        }}
        onContextMenu={handleContextMenu}
      >
        <div
          style={{ position: "relative", display: "inline-block" }}
        >
          <canvas
            ref={canvasRef}
            data-testid="pdf-canvas"
            style={{ display: "block" }}
          />
          <div
            ref={textLayerRef}
            data-testid="pdf-text-layer"
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              userSelect: "text",
              cursor: "text",
            }}
          />
        </div>
      </div>

      {contextMenu && (
        <ReferenceContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selection={contextMenu.selection}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: "4px",
  padding: "2px 7px",
  cursor: "pointer",
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-prose)",
  fontSize: "12px",
};
