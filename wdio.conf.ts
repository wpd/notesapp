// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * WebdriverIO configuration for Tauri WebDriver E2E tests.
 *
 * Prerequisites:
 *   1. `webkit2gtk-driver` apt package installed (provides WebKitWebDriver)
 *   2. App compiled: `npm run tauri:build`
 *   3. `tauri-driver` installed: `cargo install tauri-driver`
 *
 * Run via:
 *   npm run test:e2e        (handles xvfb-run automatically)
 *   xvfb-run npx wdio run wdio.conf.ts   (manual)
 */

import path from "path";
import { ChildProcess, spawn } from "child_process";

// Path to the compiled release binary
const APPLICATION = path.join(
  __dirname,
  "src-tauri",
  "target",
  "release",
  "notesapp",
);

let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  // Point wdio at the tauri-driver port (default 4444)
  hostname: "localhost",
  port: 4444,
  path: "/",

  specs: ["tests/e2e/**/*.e2e.ts"],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      browserName: "",
      // @ts-expect-error — Tauri-specific WebDriver capability
      "tauri:options": {
        application: APPLICATION,
      },
    },
  ],

  logLevel: "warn",
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 30000,
  connectionRetryCount: 1,

  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  // Start tauri-driver before test run
  onPrepare: function () {
    tauriDriver = spawn(
      process.env["TAURI_DRIVER"] ?? "tauri-driver",
      [],
      { stdio: [null, process.stdout, process.stderr] },
    );
  },

  // Stop tauri-driver after test run
  onComplete: function () {
    if (tauriDriver) {
      tauriDriver.kill();
    }
  },
};
