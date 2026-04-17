# NotesApp

A tiling markdown note-taking desktop application for AI-assisted research and learning.
Built with Tauri v2 (Rust backend + React/TypeScript frontend).

## Prerequisites

- **OS:** Ubuntu 24.04 LTS (or compatible Linux with WebKitGTK 4.1)
- **Rust:** 1.77.2+ (install via [rustup](https://rustup.rs/))
- **Node.js:** 20 LTS (install via [nvm](https://github.com/nvm-sh/nvm))
- **Python 3:** 3.10+ (for native addon builds via node-gyp)

### System packages

```bash
sudo apt update && sudo apt install -y \
  build-essential curl wget git pkg-config \
  libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev \
  libglib2.0-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  xvfb x11-utils webkit2gtk-driver
```

### Rust toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown
cargo install tauri-cli --version "^2.0"
cargo install tauri-driver
```

### Node.js

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 20
```

For the full environment setup walkthrough, see [DEV_ENVIRONMENT.md](DEV_ENVIRONMENT.md).

## Quick Start

```bash
git clone https://github.com/wpd/notesapp.git
cd notesapp
npm install
npm run tauri:dev
```

The app opens a native window. Set the `NOTESAPP_PROJECT_DIR` environment variable
to point at a directory containing your markdown notes, or choose one from the
directory picker on first launch.

## Running Tests

NotesApp has three test layers — all must pass before committing.

```bash
# Run everything
npm run test

# Or run each layer individually:
npm run test:rust    # Rust unit tests (cargo test)
npm run test:unit    # Frontend unit tests (Vitest)
npm run test:e2e     # E2E tests (WebdriverIO + Tauri WebDriver)
```

**E2E test prerequisites:** The E2E tests require a release binary and
`WebKitWebDriver`. Build the binary first, then run:

```bash
npm run tauri:build
npm run test:e2e
```

If `WebKitWebDriver` or the release binary is missing, the E2E runner
exits cleanly with a warning (it does not fail the test suite).

E2E tests run headlessly under Xvfb — no display server needed.

## Other Commands

```bash
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier
npm run tauri:build  # Production build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `C-x o` | Focus next pane |
| `C-x h` | Split horizontally |
| `C-x v` | Split vertically |
| `C-x 0` | Close current pane |
| `C-x z` | Maximize / restore pane |
| `C-x b` | Buffer switcher (open file) |
| `C-x C-s` | Save current note |
| `C-x C-f` | Open note by name |
| `C-x p` | Toggle pin on editor tile |
| `Ctrl+Shift+B` | Toggle activity sidebar |

The editor uses Emacs keybindings via `@replit/codemirror-emacs`.

## Project Structure

```
notesapp/
  src/              React/TypeScript frontend
  src-tauri/        Rust/Tauri backend
  tests/
    unit/           Vitest frontend unit tests
    e2e/            WebdriverIO E2E tests
  public/fonts/     Bundled JetBrains Mono + Inter
  scripts/          Build and test helper scripts
```

## License

- **Source code:** [MIT](LICENSE-CODE)
- **Documentation:** [CC BY 4.0](LICENSE-DOCS)

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
