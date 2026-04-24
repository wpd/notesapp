// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Pre-flight check for E2E test dependencies.
 *
 * Exits 0 with a clear warning when optional system dependencies are missing,
 * so `npm run test` still passes on a system that hasn't installed the driver.
 * When all dependencies are present it execs `xvfb-run wdio`.
 */

import { execSync, spawnSync } from "child_process";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// 1. Check for WebKitWebDriver (provided by the `webkit2gtk-driver` apt package).
function findWebKitWebDriver() {
  const result = spawnSync("which", ["WebKitWebDriver"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim().length > 0;
}

if (!findWebKitWebDriver()) {
  console.warn("");
  console.warn("⚠️  E2E TESTS SKIPPED — WebKitWebDriver not found.");
  console.warn("   This binary is provided by the webkit2gtk-driver apt package.");
  console.warn("   Install it with:");
  console.warn("     sudo apt install -y webkit2gtk-driver");
  console.warn("");
  console.warn("   Once installed, re-run: npm run test:e2e");
  console.warn("");
  process.exit(0);
}

// 2. Check for the compiled app binary.
// Cargo workspace root is notesapp/, so the binary lands in target/release/
// (not src-tauri/target/release/).
const appBinary = join(projectRoot, "target", "release", "notesapp");
if (!existsSync(appBinary)) {
  console.warn("");
  console.warn("⚠️  E2E TESTS SKIPPED — Release binary not found at:");
  console.warn("  ", appBinary);
  console.warn("   Build the app first with:");
  console.warn("     npm run tauri:build");
  console.warn("");
  process.exit(0);
}

// 3. Check for dbus-run-session — WebKitGTK requires a session bus to start its
//    web/network/GPU subprocesses. Without it, the webview hangs before firing
//    any PageLoadEvent and our wdio onPrepare hook times out waiting for the
//    NOTESAPP_PAGE_LOADED stdout marker.
function findDbusRunSession() {
  const result = spawnSync("which", ["dbus-run-session"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim().length > 0;
}
const haveDbusRunSession = findDbusRunSession();
if (!haveDbusRunSession) {
  console.warn("");
  console.warn("⚠️  dbus-run-session not found — WebKitGTK may hang on this host.");
  console.warn("   Install with: sudo apt install -y dbus-x11");
  console.warn("   Continuing anyway, but expect ECONNREFUSED on :4444.");
  console.warn("");
}

// 4. All deps present — run wdio under (optionally) dbus-run-session + xvfb-run.
console.log(
  haveDbusRunSession
    ? "✓  Running E2E tests under dbus-run-session + xvfb-run"
    : "✓  Running E2E tests under xvfb-run (no dbus-run-session)",
);

const xvfbCmd = [
  "xvfb-run",
  "--auto-servernum",
  "--server-args=-screen 0 1280x800x24",
  "npx",
  "wdio",
  "run",
  "wdio.conf.ts",
];

const [cmd, ...args] = haveDbusRunSession
  ? ["dbus-run-session", "--", ...xvfbCmd]
  : xvfbCmd;

const result = spawnSync(cmd, args, {
  cwd: projectRoot,
  stdio: "inherit",
  encoding: "utf8",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Run multi-launch E2E tests (env-resolution cases A–I, restart-delete relay).
console.log("\n✓  Main E2E suite passed. Running multi-launch tests…\n");

const multiLaunchCmd = haveDbusRunSession
  ? ["dbus-run-session", "--", "xvfb-run", "--auto-servernum",
     "--server-args=-screen 0 1280x800x24", "node",
     join(projectRoot, "scripts", "run-multi-launch-e2e.js")]
  : ["xvfb-run", "--auto-servernum",
     "--server-args=-screen 0 1280x800x24", "node",
     join(projectRoot, "scripts", "run-multi-launch-e2e.js")];

const [multiCmd, ...multiArgs] = multiLaunchCmd;
const multiResult = spawnSync(multiCmd, multiArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  encoding: "utf8",
  timeout: 600000,
});

process.exit(multiResult.status ?? 1);
