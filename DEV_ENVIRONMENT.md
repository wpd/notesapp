# NotesApp — Development Environment Setup

This document describes how to provision the development VM and configure
Claude Code for autonomous operation. Read this before starting any development phase.

---

## 1. Development VM Specification

- **OS:** Ubuntu 24.04 LTS (x86_64)
- **Purpose:** All development, testing, and integration work
- **Production target:** macOS Apple Silicon (M1+) — cross-compilation handled separately

---

## 2. Pre-Installed (Already on the VM)

The following are confirmed installed and do not need to be set up:

- **Claude Code** — the primary development agent
- **Google Chrome** — for visual debugging
- **Claude for Chrome extension** — for browser-based inspection and interaction

---

## 3. Required Dependencies

Install all of the following before starting Phase 1. Everything here is
installable without `sudo` except where the `sudo apt` commands are shown —
those are one-time system package installs.

### 3.1 System Packages (requires `sudo`)

```bash
sudo apt update && sudo apt install -y \
  build-essential \
  curl \
  wget \
  git \
  pkg-config \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libglib2.0-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  xvfb \
  x11-utils \
  webkit2gtk-driver \
  hunspell-en-us \
  ca-certificates \
  gnupg \
  lsb-release
```

> **Why these?**
> - `libwebkit2gtk-4.1-dev` and related GTK/WebKit packages: required by Tauri v2 on Linux
> - `xvfb`: virtual framebuffer — required for headless E2E test runs
> - `x11-utils`: provides `xdpyinfo` and other display diagnostic tools
> - `webkit2gtk-driver`: provides the `WebKitWebDriver` binary — required by `tauri-driver`
>   for E2E tests on Linux; without it `npm run test:e2e` skips with a warning
> - `hunspell-en-us`: spell-check dictionary — required for the spellcheck feature and the
>   E2E "Spelling decorations" test; spellbook searches `/usr/share/hunspell/` at runtime
> - `build-essential`: C/C++ toolchain required by some Rust crates and Node native addons

### 3.2 GitHub CLI (`gh`)

Required for Claude Code to inspect CI failures, manage PRs, and query
GitHub without falling back to unauthenticated WebFetch. Install via the
official apt repository:

```bash
sudo mkdir -p -m 755 /etc/apt/keyrings
wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] \
  https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install -y gh
```

Then authenticate once (interactive — run this yourself, not via Claude Code):

```bash
gh auth login
# Choose: GitHub.com → HTTPS → Login with a web browser
```

Verify:

```bash
gh auth status    # should show "Logged in to github.com"
gh --version
```

> **Why this matters for Claude Code:** without `gh`, Claude Code falls
> back to `WebFetch` for GitHub URLs, which is unauthenticated, may be
> rate-limited, and returns HTML rather than structured log data. With `gh`
> authenticated, CI log fetching (`gh run view --log-failed`) is a single
> reliable command.

### 3.3 Rust

Install via `rustup` (manages Rust versions without `sudo`):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

Verify:
```bash
rustc --version    # expect 1.77+ (Tauri v2 minimum)
cargo --version
```

Add the `wasm32` target (needed for some Tauri tooling):
```bash
rustup target add wasm32-unknown-unknown
```

### 3.4 Node.js

Use `nvm` (Node Version Manager) — avoids `sudo` and allows per-project version pinning:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20
```

Verify:
```bash
node --version    # expect v20.x
npm --version     # expect 10.x
```

### 3.5 Tauri CLI

```bash
cargo install tauri-cli --version "^2.0"
```

Verify:
```bash
cargo tauri --version
```

### 3.6 WebdriverIO + Tauri Driver (for E2E tests)

The Tauri WebDriver binary must be installed separately:

```bash
cargo install tauri-driver
```

WebdriverIO itself is installed as a dev dependency via `npm` when the project
is scaffolded (`npm install`). No global install needed.

### 3.7 Python (for native addon build tooling)

Ubuntu 24.04 ships Python 3.12. Verify it is available:

```bash
python3 --version    # expect 3.10+
```

If missing:
```bash
sudo apt install -y python3 python3-pip
```

Python is not used directly by this project but is required by some Node
native addon build scripts (`node-gyp`).

### 3.8 Optional: JetBrains Mono and Inter Fonts (system-level)

The fonts are **bundled in `public/fonts/`** and do not require system installation.
However, installing them system-wide gives Claude Code correct font metrics when
inspecting rendered output via Chrome:

```bash
# JetBrains Mono
wget https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip
unzip JetBrainsMono-2.304.zip -d /tmp/jbmono
mkdir -p ~/.local/share/fonts
cp /tmp/jbmono/fonts/ttf/*.ttf ~/.local/share/fonts/
fc-cache -fv

# Inter is available via apt on Ubuntu 24.04:
sudo apt install -y fonts-inter
```

---

## 4. Verify the Full Environment

Run this checklist after all installs. Everything must pass before starting Phase 1:

```bash
rustc --version
cargo --version
cargo tauri --version
tauri-driver --version
node --version
npm --version
python3 --version
Xvfb -help 2>&1 | head -1
google-chrome --version
git --version
pkg-config --version
gh --version
gh auth status
```

---

## 5. Configuring Claude Code for Full Autonomy

This is the most important section. The default Claude Code configuration
requires interactive approval for many shell commands. Left at defaults,
Claude Code will pause mid-phase waiting for a human to approve `grep`,
`cat`, `cargo test`, or similar benign commands — defeating the purpose
of autonomous operation.

### 5.1 The Autonomy Settings

Claude Code's permission model is controlled by two mechanisms:

**A) The `--dangerously-skip-permissions` flag**

The most direct approach. Launch Claude Code with this flag to bypass all
shell command approval prompts:

```bash
claude --dangerously-skip-permissions
```

This is appropriate for a dedicated development VM where:
- The VM is not used for anything sensitive
- You trust the instructions you are giving Claude Code
- There is no risk of a rogue command affecting systems outside the VM

> **This is the recommended mode for this project.** The VM is a sandboxed
> development environment with no sensitive credentials or production access.
> The flag name is intentionally alarming — it is appropriate here.

**B) Per-project allowed commands (`.claude/settings.json`)**

For a more surgical approach, create a settings file at the repository root
that pre-approves specific command patterns. This avoids the blanket flag
while still preventing mid-task pauses:

```json
// .claude/settings.json
{
  "permissions": {
    "allow": [
      "Bash(cargo:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(xvfb-run:*)",
      "Bash(git:*)",
      "Bash(grep:*)",
      "Bash(find:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(cp:*)",
      "Bash(mv:*)",
      "Bash(rm:*)",
      "Bash(touch:*)",
      "Bash(echo:*)",
      "Bash(curl:*)",
      "Bash(wget:*)",
      "Bash(rustc:*)",
      "Bash(rustfmt:*)",
      "Bash(clippy-driver:*)",
      "Bash(wdio:*)",
      "Bash(vitest:*)",
      "Bash(tsc:*)",
      "Bash(python3:*)",
      "Bash(fc-cache:*)",
      "Bash(unzip:*)",
      "Bash(pkill:*)",
      "Bash(kill:*)",
      "Bash(ps:*)",
      "Bash(env:*)",
      "Bash(which:*)",
      "Bash(chmod:*)",
      "Bash(gh:*)"
    ],
    "deny": [
      "Bash(sudo:*)"
    ]
  }
}
```

> **Recommendation:** Use **both** — commit `.claude/settings.json` to the
> repository so the allowlist is always in effect, AND launch with
> `--dangerously-skip-permissions` so that any command not on the list
> (e.g. a new tool Claude Code decides to use) also proceeds without
> interruption. The `deny` rule for `sudo` remains a useful guardrail
> regardless of the launch flag.

### 5.2 Recommended Launch Procedure

From the repository root on the VM:

```bash
cd /path/to/notesapp
claude --dangerously-skip-permissions
```

Then give Claude Code its starting instruction. Example for Phase 1:

```
Read CLAUDE.md and ROADMAP.md in full. Then begin Phase 1 of ROADMAP.md.
Start with the infrastructure checklist: scaffold the Tauri v2 project,
configure all three test runners (cargo test, vitest, wdio), and get
`npm run test` to a clean passing baseline before writing any UI code.
Do not ask me to verify anything manually — write tests that verify it instead.
```

### 5.3 What `--dangerously-skip-permissions` Does NOT Cover

Even with full autonomy enabled, Claude Code will still pause if it:
- Needs to install a **system package via `sudo apt`**
- Needs to modify files **outside the repository and `~/.config/` / `~/.local/`**
- Encounters an **ambiguous product decision** not covered by CLAUDE.md or SPEC.md

For the first case: all `sudo apt` dependencies must be pre-installed (§3 above)
before Claude Code starts. If Claude Code discovers a missing system dependency
mid-phase, it will stop and tell you what to install — that is correct behavior.

For the third case: Claude Code is instructed in CLAUDE.md to stop and flag
spec ambiguities rather than guess. This is intentional and desirable.

### 5.4 Keeping Claude Code Unblocked

To minimize unexpected pauses during a long autonomous run:

1. **Pre-install everything in §3** before starting any phase.
2. **Commit `.claude/settings.json`** so the allowlist is always active.
3. **Launch with `--dangerously-skip-permissions`** every time.
4. **Set a longer session timeout** if your terminal emulator supports it —
   Claude Code sessions on long tasks can run for hours.
5. **Check the CLAUDE.md "What Claude Code Must Never Do" list** — if you add
   a constraint that would require a new system tool, install it first.
6. If Claude Code gets stuck on a test failure loop, it will eventually surface
   the failure and ask for guidance. This is correct — it means the tests are
   working as intended and something genuinely needs a decision.

---

## 6. Xvfb Configuration for Headless E2E Tests

E2E tests require a display server. The `npm run test:e2e` script must invoke
`xvfb-run` automatically so tests work without a live display:

```bash
# Verify Xvfb works
xvfb-run --auto-servernum --server-args="-screen 0 1280x800x24" \
  echo "Xvfb is working"
```

The `wdio.conf.ts` and the `test:e2e` npm script are responsible for invoking
`xvfb-run`. Claude Code sets this up as part of Phase 1 infrastructure.
You should not need to manage Xvfb manually.

---

## 7. Quick Reference: Dependency Versions

| Tool | Minimum Version | Install method |
|---|---|---|
| Ubuntu | 24.04 LTS | VM base image |
| Rust / rustc | 1.77 | rustup |
| cargo | (matches rustc) | rustup |
| Tauri CLI | 2.0 | `cargo install tauri-cli` |
| tauri-driver | latest | `cargo install tauri-driver` |
| Node.js | 20 LTS | nvm |
| npm | 10 | bundled with Node 20 |
| Python 3 | 3.10 | apt (system) |
| libwebkit2gtk | 4.1 | apt |
| webkit2gtk-driver | (matches libwebkit2gtk) | apt — **required for E2E tests** |
| hunspell-en-us | any | apt — **required for spellcheck + E2E spelling test** |
| Xvfb | any | apt |
| Chrome | any recent | pre-installed |
| Claude Code | latest | pre-installed |
| Claude for Chrome | latest | pre-installed |
| GitHub CLI (`gh`) | 2.x | apt (official repo) — **required; authenticate after install** |

---

## 8. One-Time Setup Script

Run this once on a fresh VM. It assumes the system packages in §3.1
have already been installed with `sudo apt`.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== NOTE: gh auth login must be run manually after this script ==="
echo ""

echo "=== Installing Rust ==="
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown

echo "=== Installing Tauri CLI and WebDriver ==="
cargo install tauri-cli --version "^2.0"
cargo install tauri-driver

echo "=== Installing Node.js via nvm ==="
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20

echo "=== Verifying ==="
gh --version
gh auth status || echo "WARNING: gh not authenticated — run 'gh auth login' manually"
rustc --version
cargo --version
cargo tauri --version
tauri-driver --version
node --version
npm --version
python3 --version
xvfb-run echo "Xvfb OK"
which WebKitWebDriver && WebKitWebDriver --version || echo "WARNING: webkit2gtk-driver not installed — E2E tests will skip"

echo ""
echo "=== Environment ready ==="
echo "Next step: cd into the repository and run:"
echo "  claude --dangerously-skip-permissions"
```

Save as `~/setup-dev-env.sh`, make executable (`chmod +x ~/setup-dev-env.sh`),
and run it once. Do not re-run it — it is idempotent for most steps but
`cargo install` will reinstall unnecessarily.


---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*