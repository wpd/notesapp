// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri commands for full-text search.
//!
//! All commands require the `SearchState` managed by Tauri (initialized in
//! `commands::watcher::start_file_watcher` after the project is opened).

use crate::search::{query as qry, SearchHit};
use crate::{AppError, SearchState};

/// Search across all notes and references.
#[tauri::command]
pub fn search_project(
    state: tauri::State<'_, SearchState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, AppError> {
    let guard = state
        .0
        .lock()
        .map_err(|_| AppError::Search("Search lock poisoned".to_string()))?;
    match guard.as_ref() {
        None => Ok(vec![]),
        Some(idx) => qry::search(idx, &query, limit.unwrap_or(50)),
    }
}

/// Search notes only (for AI tool use in Phase 4).
#[tauri::command]
pub fn search_notes(
    state: tauri::State<'_, SearchState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, AppError> {
    let guard = state
        .0
        .lock()
        .map_err(|_| AppError::Search("Search lock poisoned".to_string()))?;
    match guard.as_ref() {
        None => Ok(vec![]),
        Some(idx) => qry::search_filtered(idx, &query, limit.unwrap_or(50), Some("note")),
    }
}

/// Search reference documents only (for AI tool use in Phase 4).
#[tauri::command]
pub fn search_references(
    state: tauri::State<'_, SearchState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, AppError> {
    let guard = state
        .0
        .lock()
        .map_err(|_| AppError::Search("Search lock poisoned".to_string()))?;
    match guard.as_ref() {
        None => Ok(vec![]),
        Some(idx) => qry::search_filtered(idx, &query, limit.unwrap_or(50), Some("reference")),
    }
}

/// Trigger a full index rebuild. Useful for debugging or after a schema
/// migration. The project directory is needed to walk all files.
#[tauri::command]
pub fn reindex_all(
    state: tauri::State<'_, SearchState>,
    project_dir: String,
) -> Result<usize, AppError> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| AppError::Search("Search lock poisoned".to_string()))?;
    match guard.as_mut() {
        None => Err(AppError::Search(
            "Search index not initialized".to_string(),
        )),
        Some(idx) => {
            let dir = std::path::PathBuf::from(&project_dir);
            idx.full_reindex(&dir)
        }
    }
}
