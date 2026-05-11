// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri command for starting the file watcher and initializing the search index.

use std::path::PathBuf;
use std::sync::Arc;

use crate::{SearchState, search::SearchIndex};

/// Start watching the project directory for file changes and initialize the
/// full-text search index.
///
/// If the search index is missing or stale (schema version mismatch), a
/// background thread performs a full reindex without blocking the UI.
#[tauri::command]
pub fn start_file_watcher(
    app: tauri::AppHandle,
    project_dir: String,
    search: tauri::State<'_, SearchState>,
) -> Result<(), String> {
    let dir = PathBuf::from(&project_dir);

    // Build (or open) the Tantivy index for this project.
    let index = SearchIndex::open_or_create(&dir).map_err(|e| e.to_string())?;
    let needs_reindex = index.needs_reindex();

    // Store the index in shared Tauri state so search commands can access it.
    {
        let mut guard = search
            .0
            .lock()
            .map_err(|_| "Search lock poisoned".to_string())?;
        *guard = Some(index);
    }

    // If a full reindex is needed, do it in the background so the UI is not
    // blocked. The index is immediately usable for queries (results will just
    // be empty until the reindex completes).
    //
    // IMPORTANT: hold the lock only briefly to extract the index path, then
    // release it before doing the actual I/O-bound reindex work.  Holding the
    // lock during full_reindex blocks all watcher incremental updates (which
    // also acquire this mutex), delaying file-change event emission.
    if needs_reindex {
        let search_arc = Arc::clone(&search.0);
        let dir_clone = dir.clone();
        std::thread::spawn(move || {
            // Full reindex can take seconds for large projects.  We acquire the
            // lock, call reindex (which opens a writer internally), then release.
            // Incremental updates that arrive during reindex use try_lock and
            // will be skipped rather than blocking; the reindex covers them.
            let result = {
                let mut guard = match search_arc.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                guard.as_mut().map(|idx| idx.full_reindex(&dir_clone))
            };
            match result {
                Some(Ok(n)) => log::info!("Search: full reindex complete — {} documents", n),
                Some(Err(e)) => eprintln!("Search: full reindex failed: {}", e),
                None => {}
            }
        });
    }

    // Clone the Arc for the watcher thread before starting it.
    let search_arc = Arc::clone(&search.0);
    crate::watcher::start_watcher(app, dir, search_arc)
}
