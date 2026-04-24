// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri command for starting the file watcher.

use std::path::PathBuf;

/// Start watching the project directory for file changes.
/// Emits `file-change` events to the frontend on deletions/renames.
#[tauri::command]
pub fn start_file_watcher(app: tauri::AppHandle, project_dir: String) -> Result<(), String> {
    let dir = PathBuf::from(&project_dir);
    crate::watcher::start_watcher(app, dir)
}
