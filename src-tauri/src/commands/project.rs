// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri commands for project directory management.

use std::path::PathBuf;

use crate::{fs as notesfs, AppError};

/// Classify a project directory path per SPEC.md §6.1.1 (cases A–I).
/// Returns a JSON object with `case` (string) and `reason` (optional string).
#[tauri::command]
pub fn classify_project_dir(path: String) -> Result<serde_json::Value, AppError> {
    let dir = PathBuf::from(&path);
    let case = notesfs::classify_project_dir(&dir);

    let (case_str, reason) = match &case {
        notesfs::ProjectDirCase::NoPath => ("A", None),
        notesfs::ProjectDirCase::ValidProject => ("B", None),
        notesfs::ProjectDirCase::UninitializedDir => ("C", None),
        notesfs::ProjectDirCase::NonExistentLeaf => ("D", None),
        notesfs::ProjectDirCase::InaccessibleStem(r) => ("E", Some(r.as_str())),
        notesfs::ProjectDirCase::NotADirectory(r) => ("F", Some(r.as_str())),
        notesfs::ProjectDirCase::MalformedProject(r) => ("G", Some(r.as_str())),
        notesfs::ProjectDirCase::SuspiciousState(r) => ("H", Some(r.as_str())),
        notesfs::ProjectDirCase::ReadOnlyDirectory(r) => ("I", Some(r.as_str())),
    };

    let can_proceed = case.can_proceed();

    Ok(serde_json::json!({
        "case": case_str,
        "canProceed": can_proceed,
        "reason": reason,
    }))
}

/// Open a project directory: validate it, scaffold if needed, and return
/// the list of notes (.md only, for backward compat with preloader).
#[tauri::command]
pub fn open_project(path: String) -> Result<Vec<notesfs::NoteEntry>, AppError> {
    let dir = PathBuf::from(&path);
    let case = notesfs::classify_project_dir(&dir);

    match case {
        notesfs::ProjectDirCase::ValidProject => {}
        notesfs::ProjectDirCase::UninitializedDir => {
            notesfs::scaffold_project(&dir)?;
        }
        notesfs::ProjectDirCase::NonExistentLeaf => {
            std::fs::create_dir_all(&dir)?;
            notesfs::scaffold_project(&dir)?;
        }
        other => {
            if let Some(reason) = other.error_reason() {
                eprintln!(
                    "NOTESAPP_PROJECT_DIR={}: {}; falling back to directory chooser",
                    path, reason
                );
            }
            return Err(AppError::Project(
                other
                    .error_reason()
                    .unwrap_or("cannot open project")
                    .to_string(),
            ));
        }
    }

    notesfs::list_notes(&dir)
}

/// List all text files in the current project directory's `notes/` folder.
/// Used by the Editor buffer picker.
#[tauri::command]
pub fn list_notes_all(path: String) -> Result<Vec<notesfs::NoteEntry>, AppError> {
    let dir = PathBuf::from(&path);
    notesfs::list_notes_all(&dir)
}

/// List only .md files in the current project directory's `notes/` folder.
/// Used by the Preview buffer picker and for backward compatibility.
#[tauri::command]
pub fn list_notes(path: String) -> Result<Vec<notesfs::NoteEntry>, AppError> {
    let dir = PathBuf::from(&path);
    notesfs::list_notes(&dir)
}
