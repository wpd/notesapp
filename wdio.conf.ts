// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * WebdriverIO configuration for Tauri WebDriver E2E tests.
 *
 * Architecture on Linux (Ubuntu 24.04 + webkit2gtk 4.1):
 *
 *   Tauri app (started with WEBKIT_INSPECTOR_SERVER=127.0.0.1:4445)
 *       ↓  WebKit remote-inspection WebSocket on :4445
 *   WebKitWebDriver (--port=4444 --target=127.0.0.1:4445)
 *       ↓  WebDriver HTTP on :4444
 *   wdio → our tests
 *
 * The critical fix: after the WebDriver session is established (which attaches
 * to the running webview but in an isolation context that cannot see JS already
 * executed on the page), we issue an explicit browser.url('tauri://localhost/')
 * in the global `before` hook.  This forces the webview to load the page fresh
 * inside the automation context, so ES-module scripts execute and React mounts.
 *
 * Why not webkit:browserOptions.binary?
 *   This version of WebKitWebDriver does not launch Tauri apps via capabilities;
 *   it opens MiniBrowser instead.  Only the --target + explicit navigation
 *   approach reaches the Tauri webview reliably.
 *
 * Prerequisites:
 *   1. webkit2gtk-driver installed   (sudo apt install webkit2gtk-driver)
 *   2. App compiled                  (npm run tauri:build)
 *
 * Run via:
 *   npm run test:e2e   (adds xvfb-run automatically)
 */

import path from "path";
import { fileURLToPath } from "url";
import { ChildProcess, spawn, spawnSync } from "child_process";
import net from "net";
import os from "os";
import fs from "fs";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargo workspace root is notesapp/, so binary lands in target/release/
const APPLICATION = path.join(__dirname, "target", "release", "notesapp");

const WEBKIT_INSPECTION_PORT = 4445;
const WEBDRIVER_PORT = 4444;

let appProcess: ChildProcess | undefined;
let webkitDriver: ChildProcess | undefined;
let testProjectDir: string | undefined;

/** Poll until something is listening on host:port, up to timeoutMs. */
function waitForPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const sock = new net.Socket();
      sock
        .connect(port, host, () => {
          sock.destroy();
          resolve();
        })
        .on("error", () => {
          sock.destroy();
          if (Date.now() >= deadline) {
            reject(
              new Error(
                `Timed out waiting for ${host}:${port} after ${timeoutMs}ms`,
              ),
            );
          } else {
            setTimeout(attempt, 200);
          }
        });
    };
    attempt();
  });
}

export const config: WebdriverIO.Config = {
  hostname: "localhost",
  port: WEBDRIVER_PORT,
  path: "/",

  specs: ["tests/e2e/app.e2e.ts"],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      // No browserName constraint — let WebKitWebDriver match whatever the
      // Tauri webview reports.
    },
  ],

  logLevel: "warn",
  bail: 0,
  waitforTimeout: 20000,
  connectionRetryTimeout: 30000,
  connectionRetryCount: 3,

  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  // ---------------------------------------------------------------------------
  // Navigate to the Tauri app and wait for React to mount before any tests.
  //
  // Architecture:
  //   1. The Tauri app starts and loads tauri://localhost/ (on_page_load hook
  //      prints NOTESAPP_PAGE_LOADED when done, signalling onPrepare to start
  //      WebKitWebDriver).
  //   2. WebKitWebDriver creates a WebDriver automation session.  Critically,
  //      creating this session RESETS the webview to about:blank — this is
  //      standard WebKit automation behaviour.
  //   3. We must navigate BACK to tauri://localhost/ using JavaScript
  //      (window.location.replace) because browser.url() does not support
  //      custom URL schemes in WebKitWebDriver.
  //   4. We then wait for React to mount (app-root element to appear).
  // ---------------------------------------------------------------------------
  before: async function () {
    // Strategy:
    //   1. Navigate to tauri://localhost/ (triggers page load).
    //   2. Wait for __NOTESAPP_PRELOADED__ to be set (Rust on_page_load hook).
    //   3. Call window.__notesapp_boot__() via browser.execute() to force a
    //      fresh synchronous render with the preloaded data.  This is more
    //      reliable than relying on React passive effects (MessageChannel) or
    //      MutationObserver timers — both can be throttled in WebKit automation.
    //   4. Wait for app-shell (XPath, sees live DOM) to confirm AppShell is up.

    await browser.url("tauri://localhost/");

    // Poll until __NOTESAPP_PRELOADED__ is set (by on_page_load(Finished)).
    // browser.execute() can read custom window properties even though it uses
    // a stale execution context for DOM queries.
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            !!(
              window as Window & {
                __NOTESAPP_PRELOADED__?: { dir?: string };
              }
            ).__NOTESAPP_PRELOADED__?.dir,
        ),
      { timeout: 15000, interval: 100, timeoutMsg: "__NOTESAPP_PRELOADED__ not set after 15s" },
    );

    // Boot the React app.  In WebKit automation mode, session creation may
    // reset the DOM or leave the concurrent-mode scheduler's MessageChannel
    // queue unprocessed; calling __notesapp_boot__ directly guarantees a
    // fresh synchronous render.
    await browser.execute(() => {
      (window as Window & { __notesapp_boot__?: () => void }).__notesapp_boot__?.();
    });

    // Wait for AppShell to be in the live DOM (XPath sees live DOM).
    await $('//*[@data-testid="app-shell"]').waitForExist({ timeout: 10000 });

    // Brief pause to let AppShell's layout useEffect (initDefaultLayout) run
    // so tiles are in the tree before the first test queries them.
    await browser.pause(300);
  },

  onPrepare: async function () {
    // 0. Kill any stale processes left from a previous aborted run.
    spawnSync("fuser", ["-k", `${WEBKIT_INSPECTION_PORT}/tcp`, `${WEBDRIVER_PORT}/tcp`], {
      stdio: "ignore",
    });
    // Brief pause so the OS fully releases the ports.
    await new Promise((r) => setTimeout(r, 500));

    // 0.5. Create a temporary test project directory with some sample notes.
    testProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), "notesapp-e2e-"));
    const notesDir = path.join(testProjectDir, "notes");
    const notesAppDir = path.join(testProjectDir, ".notesapp");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(notesAppDir, { recursive: true });
    fs.mkdirSync(path.join(testProjectDir, "references"), { recursive: true });
    fs.mkdirSync(path.join(testProjectDir, "attachments"), { recursive: true });
    // Create sample notes for testing the explorer and buffer switcher
    fs.writeFileSync(path.join(notesDir, "alpha.md"), "# Alpha Note\n\nThis is the alpha note.\n");
    fs.writeFileSync(path.join(notesDir, "beta.md"), "# Beta Note\n\nThis is the beta note.\n");
    fs.writeFileSync(path.join(notesDir, "gamma.md"), "# Gamma Note\n\nThis is the gamma note.\n");
    // Fixture for Mermaid rendering tests — long preamble before the diagram
    // so that renderMarkdown() takes non-trivial time, matching the user's
    // real note which has substantial content above the mermaid block.
    fs.writeFileSync(
      path.join(notesDir, "mermaid.md"),
      [
        "# Mermaid Rendering Test",
        "",
        "This note tests that a fenced mermaid block is rendered as an SVG diagram.",
        "There is deliberately a lot of content above the diagram so that the async",
        "renderMarkdown pipeline takes long enough to widen the race window between",
        "the `setHtml` React state update and the `mermaid.render()` await.",
        "",
        "## Section 1 — Background",
        "",
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor",
        "incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis",
        "nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        "",
        "## Section 2 — Test Cases",
        "",
        "**Test A** — expected: diagram renders on document open (not on typing).",
        "",
        "> Expected: the SVG appears immediately after the note opens in Preview.",
        "> Input: A note with a single fenced mermaid block.",
        "> Observed: the fenced code block is replaced with an SVG diagram.",
        "",
        "**Text B** — squiggles appear after typing.",
        "",
        "> Expected: no squiggles on diagram source inside fences.",
        "> Input: graph TD syntax is not natural language.",
        "> Observed: diagram renders without spell-check decorations.",
        "",
        "**Text C** — squiggles appear on document open.",
        "",
        "> Expected: red underlines appear beneath misspelled words (if any) in",
        "> create-some, close it, open the app, re-open it).",
        "",
        "**Text D** — squiggles disappear after typing.",
        "",
        "> Expected: the diagram contains no deliberate misspellings.",
        "",
        "## Section 3 — Notes on Implementation",
        "",
        "The mermaid rendering pipeline is: `renderMarkdown` produces",
        "`<pre><code class=\"language-mermaid\">...</code></pre>` and",
        "`renderMermaidBlocks` replaces it with a `<div class=\"mermaid-container\">`",
        "containing the SVG from `mermaid.render()`.",
        "",
        "Here is the same diagram outside a fenced fence (known to be incorrect,",
        "included only to verify that unfenced content renders as plain text):",
        "",
        "graph TD A[Start] --> B[End]",
        "",
        "## Section 4 — Diagram",
        "",
        "```mermaid",
        "graph TD",
        "    A[Start] --> B[End]",
        "```",
      ].join("\n") + "\n",
    );
    // Create minimal project.toml
    fs.writeFileSync(
      path.join(notesAppDir, "project.toml"),
      `[project]\nname = "E2E Test Project"\nversion = "1"\n`,
    );
    console.log(`  Test project dir: ${testProjectDir}`);
    // Expose the project dir to spec files (same Node process) so they can
    // observe files the Tauri backend writes into .notesapp/ (layout.json, …).
    process.env.NOTESAPP_E2E_PROJECT_DIR = testProjectDir;

    // 1. Start the Tauri app with WebKit remote-inspection and automation enabled.
    // Use 'pipe' for stdout so we can watch for the NOTESAPP_PAGE_LOADED marker
    // that lib.rs emits via on_page_load when the webview finishes loading.
    // WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS is intentionally omitted so
    // tests run in the same sandboxed context the user experiences in dev mode.
    appProcess = spawn(APPLICATION, [], {
      env: {
        ...process.env,
        WEBKIT_INSPECTOR_SERVER: `127.0.0.1:${WEBKIT_INSPECTION_PORT}`,
        TAURI_WEBVIEW_AUTOMATION: "true",
        WEBKIT_DISABLE_DMABUF_RENDERER: "1",
        LIBGL_ALWAYS_SOFTWARE: "1",
        NOTESAPP_PROJECT_DIR: testProjectDir,
      },
      stdio: ["ignore", "pipe", process.stderr],
    });

    // Forward app stdout to our stdout AND watch for the page-loaded marker.
    const pageLoadedPromise = new Promise<void>((resolve) => {
      const deadline = setTimeout(() => {
        console.log("  Warning: NOTESAPP_PAGE_LOADED not seen after 20s; proceeding anyway.");
        resolve();
      }, 20000);
      if (!appProcess?.stdout) { clearTimeout(deadline); resolve(); return; }
      appProcess.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        process.stdout.write(text); // forward to our stdout
        if (text.includes("NOTESAPP_PAGE_LOADED")) {
          clearTimeout(deadline);
          resolve();
        }
      });
    });

    // 2. Wait for the WebKit inspection server to accept connections.
    console.log(
      `  Waiting for WebKit inspector on :${WEBKIT_INSPECTION_PORT}…`,
    );
    await waitForPort("127.0.0.1", WEBKIT_INSPECTION_PORT, 20000);
    console.log("  WebKit inspector ready.");

    // 2.5. Wait for the Tauri webview to finish loading tauri://localhost/
    // before starting WebKitWebDriver.  The inspection port opens while the
    // webview is still at about:blank; if WebKitWebDriver connects then, the
    // session is permanently bound to the blank page.  The Rust on_page_load
    // hook prints "NOTESAPP_PAGE_LOADED" when the page finishes loading, which
    // is our reliable signal that it is safe to connect.
    console.log("  Waiting for NOTESAPP_PAGE_LOADED marker…");
    await pageLoadedPromise;
    console.log("  Tauri page loaded — connecting WebKitWebDriver.");

    // 3. Start WebKitWebDriver pointing at the running app's inspection port.
    webkitDriver = spawn(
      "WebKitWebDriver",
      [
        `--port=${WEBDRIVER_PORT}`,
        `--target=127.0.0.1:${WEBKIT_INSPECTION_PORT}`,
      ],
      { stdio: [null, process.stdout, process.stderr] },
    );

    // 4. Wait for WebKitWebDriver to be ready to accept connections.
    await waitForPort("127.0.0.1", WEBDRIVER_PORT, 10000);
    console.log("  WebKitWebDriver ready.");
  },

  onComplete: function () {
    if (webkitDriver) webkitDriver.kill();
    if (appProcess) appProcess.kill();
    // SIGTERM alone does not kill WebKitWebDriver's and WebKitGTK's subprocess
    // trees on Linux (they may be in a separate process group). Force-clean the
    // ports so the next run's onPrepare finds them free without needing fuser.
    spawnSync("fuser", ["-k", `${WEBKIT_INSPECTION_PORT}/tcp`, `${WEBDRIVER_PORT}/tcp`], {
      stdio: "ignore",
    });
    // Clean up temp project dir
    if (testProjectDir) {
      try {
        fs.rmSync(testProjectDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
};
