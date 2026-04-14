// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri commands for project directory management.

use std::path::PathBuf;

use crate::{fs as notesfs, AppError};

/// Open a project directory: validate it, scaffold if needed, and return
/// the list of notes. Reads `NOTESAPP_PROJECT_DIR` env var first; if unset
/// the frontend should show the directory-chooser dialog.
#[tauri::command]
pub fn open_project(path: String) -> Result<Vec<notesfs::NoteEntry>, AppError> {
    let dir = PathBuf::from(&path);
    notesfs::init_project_dir(&dir)?;
    notesfs::list_notes(&dir)
}

/// List all markdown notes in the current project directory's `notes/` folder.
#[tauri::command]
pub fn list_notes(path: String) -> Result<Vec<notesfs::NoteEntry>, AppError> {
    let dir = PathBuf::from(&path);
    notesfs::list_notes(&dir)
}
