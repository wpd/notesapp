// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Multi-launch E2E driver — runs parametric wdio specs that each need
 * their own Tauri binary instance with a different fixture.
 *
 * Covers:
 *   - NOTESAPP_PROJECT_DIR resolution cases A–I (Gap 1)
 *   - Restart with deleted bound note (Gap 2)
 *
 * Usage:
 *   node scripts/run-multi-launch-e2e.js
 *
 * Called by check-e2e-deps.js after the main suite passes.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

let failures = 0;
let passes = 0;

function runWdio(specFile, envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  const args = [
    "wdio", "run", "wdio-env.conf.ts",
    "--spec", specFile,
  ];
  const result = spawnSync("npx", args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.status === 0) {
    passes++;
  } else {
    failures++;
    console.error(`  FAILED: ${specFile} (exit ${result.status})`);
  }
  return result.status === 0;
}

function mkFixture(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `notesapp-e2e-${name}-`));
  return dir;
}

function scaffoldProject(dir) {
  const notesDir = path.join(dir, "notes");
  const dotDir = path.join(dir, ".notesapp");
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(dotDir, { recursive: true });
  fs.mkdirSync(path.join(dir, "references"), { recursive: true });
  fs.mkdirSync(path.join(dir, "attachments"), { recursive: true });
  fs.writeFileSync(
    path.join(notesDir, "alpha.md"),
    "# Alpha Note\n\nThis is the alpha note.\n",
  );
  fs.writeFileSync(
    path.join(notesDir, "beta.md"),
    "# Beta Note\n\nThis is the beta note.\n",
  );
  fs.writeFileSync(
    path.join(dotDir, "project.toml"),
    `[project]\nname = "Test"\nversion = "1"\n`,
  );
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// =========================================================================
// Gap 1 — NOTESAPP_PROJECT_DIR resolution cases A–I
// =========================================================================

console.log("\n=== Gap 1: NOTESAPP_PROJECT_DIR resolution cases ===\n");

const specFile = "tests/e2e/env-resolution.e2e.ts";
const fixtures = [];

// Case A — env var unset
console.log("Case A: env var unset → chooser");
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "A",
  NOTESAPP_TEST_NO_ENV: "1",
});

// Case B — valid project
console.log("\nCase B: valid project → app loads");
const dirB = mkFixture("B");
scaffoldProject(dirB);
fixtures.push(dirB);
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "B",
  NOTESAPP_TEST_PROJECT_DIR: dirB,
});

// Case C — uninitialized existing directory
console.log("\nCase C: uninitialized dir → scaffold + load");
const dirC = mkFixture("C");
fs.mkdirSync(dirC, { recursive: true });
// No .notesapp/ → will scaffold
fixtures.push(dirC);
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "C",
  NOTESAPP_TEST_PROJECT_DIR: dirC,
});

// Case D — non-existent leaf, writable parent
console.log("\nCase D: non-existent leaf → create + scaffold + load");
const parentD = mkFixture("D-parent");
const dirD = path.join(parentD, "newproject");
// dirD doesn't exist yet — Tauri should create it
fixtures.push(parentD);
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "D",
  NOTESAPP_TEST_PROJECT_DIR: dirD,
});

// Case E — inaccessible stem (parent dir doesn't exist and can't be created)
console.log("\nCase E: inaccessible stem → chooser");
const dirE = "/nonexistent_root_z9x8y7/project";
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "E",
  NOTESAPP_TEST_PROJECT_DIR: dirE,
});

// Case F — path is a regular file, not a directory
console.log("\nCase F: not a directory → chooser");
const dirF = mkFixture("F");
const fileF = path.join(dirF, "notadir");
fs.writeFileSync(fileF, "I am a file, not a directory.\n");
fixtures.push(dirF);
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "F",
  NOTESAPP_TEST_PROJECT_DIR: fileF,
});

// Case G — malformed project.toml
console.log("\nCase G: malformed project.toml → chooser");
const dirG = mkFixture("G");
fs.mkdirSync(path.join(dirG, ".notesapp"), { recursive: true });
fs.writeFileSync(
  path.join(dirG, ".notesapp", "project.toml"),
  "THIS IS NOT VALID TOML {{{{{",
);
fixtures.push(dirG);
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "G",
  NOTESAPP_TEST_PROJECT_DIR: dirG,
});

// Case H — suspicious state (missing project.toml but .notesapp/ exists)
console.log("\nCase H: missing project.toml → chooser");
const dirH = mkFixture("H");
fs.mkdirSync(path.join(dirH, ".notesapp"), { recursive: true });
// No project.toml inside .notesapp/
fixtures.push(dirH);
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "H",
  NOTESAPP_TEST_PROJECT_DIR: dirH,
});

// Case I — read-only directory
console.log("\nCase I: read-only dir → chooser");
const dirI = mkFixture("I");
scaffoldProject(dirI);
// Make it read-only
fs.chmodSync(dirI, 0o444);
fixtures.push(dirI);
runWdio(specFile, {
  NOTESAPP_TEST_CASE: "I",
  NOTESAPP_TEST_PROJECT_DIR: dirI,
});
// Restore permissions so cleanup works
try { fs.chmodSync(dirI, 0o755); } catch { /* ignore */ }

// =========================================================================
// Gap 2 — Restart with deleted bound note
// =========================================================================

console.log("\n=== Gap 2: Restart with deleted bound note ===\n");

const restartSpec = "tests/e2e/restart-check.e2e.ts";
const dirRestart = mkFixture("restart");
scaffoldProject(dirRestart);
fixtures.push(dirRestart);

// Pre-write a layout.json that explicitly binds a tile to alpha.md so the
// restart-check spec can verify it — regardless of note-list sort order.
const alphaNotePath = path.join(dirRestart, "notes", "alpha.md");
const presetLayout = JSON.stringify({
  tree: "editor-1",
  tiles: {
    "editor-1": { mode: "editor", filePath: alphaNotePath },
  },
});
fs.writeFileSync(
  path.join(dirRestart, ".notesapp", "layout.json"),
  presetLayout,
);
console.log(`  Pre-wrote layout.json binding editor-1 to alpha.md`);

// Phase 1: setup — app loads normally
console.log("Phase 1: setup — verify tile bound to alpha.md");
runWdio(restartSpec, {
  NOTESAPP_TEST_PHASE: "setup",
  NOTESAPP_TEST_PROJECT_DIR: dirRestart,
});

// Between phases: delete alpha.md
const alphaPath = path.join(dirRestart, "notes", "alpha.md");
const alphaBackup = path.join(dirRestart, "alpha.md.bak");
if (fs.existsSync(alphaPath)) {
  fs.copyFileSync(alphaPath, alphaBackup);
  fs.unlinkSync(alphaPath);
  console.log("  Deleted alpha.md between launches.");
}

// Phase 2: missing — tile should reopen in Missing mode
console.log("\nPhase 2: missing — verify tile is in Missing mode");
runWdio(restartSpec, {
  NOTESAPP_TEST_PHASE: "missing",
  NOTESAPP_TEST_PROJECT_DIR: dirRestart,
});

// Between phases: restore alpha.md
if (fs.existsSync(alphaBackup)) {
  fs.copyFileSync(alphaBackup, alphaPath);
  fs.unlinkSync(alphaBackup);
  console.log("  Restored alpha.md between launches.");
}

// Phase 3: restored — tile should reopen normally
console.log("\nPhase 3: restored — verify tile is normal editor");
runWdio(restartSpec, {
  NOTESAPP_TEST_PHASE: "restored",
  NOTESAPP_TEST_PROJECT_DIR: dirRestart,
});

// =========================================================================
// Cleanup
// =========================================================================

for (const dir of fixtures) {
  cleanup(dir);
}

console.log(`\n=== Multi-launch E2E: ${passes} passed, ${failures} failed ===\n`);
process.exit(failures > 0 ? 1 : 0);
