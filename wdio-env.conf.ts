// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Simplified wdio config for multi-launch E2E tests.
 *
 * Unlike wdio.conf.ts (which creates its own temp project), this config:
 * - Reads NOTESAPP_TEST_PROJECT_DIR from the env for the fixture path.
 * - If NOTESAPP_TEST_NO_ENV is set, does NOT pass NOTESAPP_PROJECT_DIR
 *   to the Tauri binary (for case A: env var unset).
 * - Does NOT wait for app-shell — each spec handles its own assertions.
 */

import path from "path";
import { fileURLToPath } from "url";
import { ChildProcess, spawn } from "child_process";
import net from "net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPLICATION = path.join(__dirname, "target", "release", "notesapp");
const WEBKIT_INSPECTION_PORT = 4445;
const WEBDRIVER_PORT = 4444;

let appProcess: ChildProcess | undefined;
let webkitDriver: ChildProcess | undefined;

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

  // Spec is passed via --spec on the command line.
  specs: [],
  maxInstances: 1,

  capabilities: [{ maxInstances: 1 }],

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

  before: async function () {
    await browser.url("tauri://localhost/");

    // Wait for __NOTESAPP_PRELOADED__ to be set.
    //
    // The Rust on_page_load hook now sets __NOTESAPP_PRELOADED__ for BOTH
    // success and error cases whenever NOTESAPP_PROJECT_DIR is present:
    //   - Success (B/C/D): { dir: "...", notes: [...] }
    //   - Error   (E–I):   { dir: null, error: "reason..." }
    //   - No env var (A):  nothing — __NOTESAPP_PRELOADED__ is never set
    //
    // We wait up to 15 s regardless of success/error.  If the env var was
    // not set (case A), the timeout triggers and we fall through.
    let hasPreloaded = false;
    try {
      await browser.waitUntil(
        () =>
          browser.execute(
            () =>
              !!(
                window as Window & {
                  __NOTESAPP_PRELOADED__?: object;
                }
              ).__NOTESAPP_PRELOADED__,
          ),
        { timeout: 15000, interval: 100 },
      );
      hasPreloaded = true;
    } catch {
      // Timed out — env var not set (case A); chooser is the expected path.
    }

    // Boot React.  WebKit automation mode clears document.body when the
    // session is created, so we always need an explicit boot() call here.
    // boot() reads __NOTESAPP_PRELOADED__ and pre-hydrates Zustand:
    //   - Success data → AppShell renders immediately (no IPC needed).
    //   - Error data   → ProjectLoader renders with button visible (no IPC).
    //   - No data      → ProjectLoader renders; tryAutoLoad fires (case A only).
    await browser.execute(() => {
      (window as Window & { __notesapp_boot__?: () => void }).__notesapp_boot__?.();
    });

    if (hasPreloaded) {
      // __NOTESAPP_PRELOADED__ was set — wait for the UI to reach its final
      // state (app-shell for success, choose-directory-button for errors).
      await browser.waitUntil(
        async () => {
          const appShell = await $('//*[@data-testid="app-shell"]');
          if (await appShell.isExisting()) return true;
          const btn = await $('//*[@data-testid="choose-directory-button"]');
          if (await btn.isExisting()) return true;
          return false;
        },
        {
          timeout: 10000,
          interval: 200,
          timeoutMsg: "Neither app-shell nor choose-directory-button appeared after 10s",
        },
      );
    } else {
      // Case A: no env var.  tryAutoLoad() fires, gets null from
      // get_project_dir_env, calls setLoading(false).  Button appears fast.
      await $('//*[@data-testid="choose-directory-button"]').waitForExist({ timeout: 10000 });
    }
    await browser.pause(200);
  },

  onPrepare: async function () {
    const { spawnSync } = await import("child_process");
    spawnSync("fuser", ["-k", `${WEBKIT_INSPECTION_PORT}/tcp`, `${WEBDRIVER_PORT}/tcp`], {
      stdio: "ignore",
    });
    await new Promise((r) => setTimeout(r, 500));

    const testDir = process.env.NOTESAPP_TEST_PROJECT_DIR;
    const noEnv = !!process.env.NOTESAPP_TEST_NO_ENV;

    const appEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      WEBKIT_INSPECTOR_SERVER: `127.0.0.1:${WEBKIT_INSPECTION_PORT}`,
      TAURI_WEBVIEW_AUTOMATION: "true",
      WEBKIT_DISABLE_DMABUF_RENDERER: "1",
      WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: "1",
      LIBGL_ALWAYS_SOFTWARE: "1",
    };

    if (noEnv) {
      delete appEnv.NOTESAPP_PROJECT_DIR;
    } else if (testDir) {
      appEnv.NOTESAPP_PROJECT_DIR = testDir;
    }

    appProcess = spawn(APPLICATION, [], {
      env: appEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const pageLoadedPromise = new Promise<void>((resolve) => {
      const deadline = setTimeout(() => resolve(), 15000);
      if (!appProcess?.stdout) { clearTimeout(deadline); resolve(); return; }
      appProcess.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes("NOTESAPP_PAGE_LOADED")) {
          clearTimeout(deadline);
          resolve();
        }
      });
    });

    // Capture stderr for assertions (env-var error messages).
    let stderrBuf = "";
    appProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });
    // Expose stderr to specs.
    process.env.__NOTESAPP_STDERR__ = "";
    appProcess.on("close", () => {
      process.env.__NOTESAPP_STDERR__ = stderrBuf;
    });
    // Also poll it via a short-lived property.
    const stderrPoller = setInterval(() => {
      process.env.__NOTESAPP_STDERR__ = stderrBuf;
    }, 200);
    setTimeout(() => clearInterval(stderrPoller), 20000);

    await waitForPort("127.0.0.1", WEBKIT_INSPECTION_PORT, 15000);
    await pageLoadedPromise;

    webkitDriver = spawn(
      "WebKitWebDriver",
      [
        `--port=${WEBDRIVER_PORT}`,
        `--target=127.0.0.1:${WEBKIT_INSPECTION_PORT}`,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );

    await waitForPort("127.0.0.1", WEBDRIVER_PORT, 10000);
  },

  onComplete: function () {
    if (webkitDriver) webkitDriver.kill();
    if (appProcess) appProcess.kill();
  },
};
