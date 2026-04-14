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
 * Why not tauri-driver?
 *   tauri-driver sends "webkitgtk:browserOptions" but WebKitWebDriver ≥ 2.46
 *   only accepts "webkit:browserOptions".  We replicate tauri-driver's actual
 *   algorithm (WEBKIT_INSPECTOR_SERVER + --target) directly here instead.
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
import { ChildProcess, spawn } from "child_process";
import net from "net";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargo workspace root is notesapp/, so binary lands in target/release/
const APPLICATION = path.join(__dirname, "target", "release", "notesapp");

const WEBKIT_INSPECTION_PORT = 4445;
const WEBDRIVER_PORT = 4444;

let appProcess: ChildProcess | undefined;
let webkitDriver: ChildProcess | undefined;

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

  specs: ["tests/e2e/**/*.e2e.ts"],
  maxInstances: 1,

  // Session is created against the already-running Tauri webview via --target.
  // No "binary" capability needed — the app is started in onPrepare below.
  capabilities: [
    {
      maxInstances: 1,
      // No browserName constraint — the Tauri webview doesn't report "MiniBrowser".
      // Leaving it unset matches any browser name reported by the webview.
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

  onPrepare: async function () {
    // 0. Kill any stale processes left from a previous aborted run.
    const { spawnSync } = await import("child_process");
    spawnSync("fuser", ["-k", `${WEBKIT_INSPECTION_PORT}/tcp`, `${WEBDRIVER_PORT}/tcp`], {
      stdio: "ignore",
    });

    // 1. Start the Tauri app with WebKit remote-inspection and automation enabled.
    appProcess = spawn(APPLICATION, [], {
      env: {
        ...process.env,
        WEBKIT_INSPECTOR_SERVER: `127.0.0.1:${WEBKIT_INSPECTION_PORT}`,
        // Enable WebDriver automation — tauri-runtime-wry reads this env var and
        // calls wry::WebContext::set_allows_automation(true), which is required for
        // WebKitWebDriver to establish a session with the running webview.
        TAURI_WEBVIEW_AUTOMATION: "true",
        // Suppress GPU-acceleration errors in VMs (non-fatal, just noisy).
        WEBKIT_DISABLE_DMABUF_RENDERER: "1",
        LIBGL_ALWAYS_SOFTWARE: "1",
      },
      stdio: [null, process.stdout, process.stderr],
    });

    // 2. Wait for the WebKit inspection server to accept connections.
    console.log(
      `  Waiting for WebKit inspector on :${WEBKIT_INSPECTION_PORT}…`,
    );
    await waitForPort("127.0.0.1", WEBKIT_INSPECTION_PORT, 20000);
    console.log("  WebKit inspector ready.");

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
  },
};
