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

// 3. All deps present — run wdio under xvfb-run.
console.log("✓  WebKitWebDriver found — running E2E tests under xvfb-run");

const result = spawnSync(
  "xvfb-run",
  [
    "--auto-servernum",
    "--server-args=-screen 0 1280x800x24",
    "npx",
    "wdio",
    "run",
    "wdio.conf.ts",
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    encoding: "utf8",
  },
);

process.exit(result.status ?? 1);
