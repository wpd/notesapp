// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! File watcher for the project directory.
//!
//! Watches `notes/`, `references/`, and `.notesapp/ai-context/` for external
//! changes (deletions, renames) and notifies the frontend so bound tiles can
//! transition to Missing mode per SPEC.md §5.5.
//!
//! Also drives incremental Tantivy index updates: on every `modify`/`create`
//! event the affected file is upserted into the index; on `delete` it is
//! removed.

use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::search::SearchIndex;

pub(crate) type SharedSearchIndex = Arc<Mutex<Option<SearchIndex>>>;

const DEBOUNCE_MS: u64 = 500;

/// Event payload emitted to the frontend via Tauri's event system.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileChangeEvent {
    /// "delete" or "modify"
    pub kind: String,
    /// Absolute path of the affected file
    pub path: String,
}

/// Start watching the project directory for file changes.
/// Emits `file-change` events to the frontend and updates the Tantivy index.
pub fn start_watcher(
    app: AppHandle,
    project_dir: PathBuf,
    search: SharedSearchIndex,
) -> Result<(), String> {
    let dirs_to_watch: Vec<PathBuf> = vec![
        project_dir.join("notes"),
        project_dir.join("references"),
        project_dir.join(".notesapp").join("ai-context"),
    ];

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(DEBOUNCE_MS), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Failed to create file watcher: {}", e);
                return;
            }
        };

        for dir in &dirs_to_watch {
            if dir.is_dir() {
                if let Err(e) = debouncer
                    .watcher()
                    .watch(dir, notify::RecursiveMode::Recursive)
                {
                    eprintln!("Failed to watch {}: {}", dir.display(), e);
                }
            }
        }

        loop {
            match rx.recv() {
                Ok(Ok(events)) => {
                    for event in events {
                        let kind = classify_event(&event);
                        // Drive the Tantivy index incrementally.
                        update_search_index(&search, &event.path, kind.as_deref());
                        // Emit frontend event.
                        if let Some(k) = kind {
                            let payload = FileChangeEvent {
                                kind: k,
                                path: event.path.to_string_lossy().to_string(),
                            };
                            let _ = app.emit("file-change", payload);
                        }
                    }
                }
                Ok(Err(e)) => {
                    eprintln!("File watcher error: {}", e);
                }
                Err(_) => {
                    break;
                }
            }
        }
    });

    Ok(())
}

fn classify_event(event: &DebouncedEvent) -> Option<String> {
    if !event.path.exists() {
        Some("delete".to_string())
    } else {
        Some("modify".to_string())
    }
}

fn update_search_index(
    search: &SharedSearchIndex,
    path: &std::path::Path,
    kind: Option<&str>,
) {
    // Use try_lock so a long-running background reindex never blocks the
    // watcher thread.  If the lock is held by the reindex, skip this
    // incremental update — the reindex will pick up the change anyway.
    let Ok(mut guard) = search.try_lock() else {
        return;
    };
    let Some(idx) = guard.as_mut() else {
        return;
    };
    match kind {
        Some("delete") => {
            if let Err(e) = idx.remove_path(path) {
                eprintln!("Search remove_path failed for {}: {}", path.display(), e);
            }
        }
        Some("modify") => {
            if let Err(e) = idx.upsert_path(path) {
                eprintln!("Search upsert_path failed for {}: {}", path.display(), e);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify_debouncer_mini::DebouncedEventKind;
    use tempfile::TempDir;

    #[test]
    fn classify_event_deleted_file() {
        let event = DebouncedEvent {
            path: PathBuf::from("/nonexistent/file.md"),
            kind: DebouncedEventKind::Any,
        };
        assert_eq!(classify_event(&event), Some("delete".to_string()));
    }

    #[test]
    fn classify_event_existing_file() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("test.md");
        std::fs::write(&file, "content").unwrap();
        let event = DebouncedEvent {
            path: file,
            kind: DebouncedEventKind::Any,
        };
        assert_eq!(classify_event(&event), Some("modify".to_string()));
    }

    #[test]
    fn update_search_index_with_none_does_not_panic() {
        let search: SharedSearchIndex = Arc::new(Mutex::new(None));
        let path = PathBuf::from("/some/path.md");
        // Should silently no-op when index is not initialized
        update_search_index(&search, &path, Some("modify"));
        update_search_index(&search, &path, Some("delete"));
    }

    #[test]
    fn update_search_index_upsert_and_remove() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();
        std::fs::create_dir_all(dir.join(".notesapp")).unwrap();
        std::fs::create_dir_all(dir.join("notes")).unwrap();

        let note_path = dir.join("notes/test.md");
        std::fs::write(&note_path, "searchable watcher content").unwrap();

        let mut idx = crate::search::SearchIndex::open_or_create(&dir).unwrap();
        idx.full_reindex(&dir).unwrap();
        let search: SharedSearchIndex = Arc::new(Mutex::new(Some(idx)));

        // Upsert should work without error
        update_search_index(&search, &note_path, Some("modify"));
        // Delete should work without error
        update_search_index(&search, &note_path, Some("delete"));
    }
}
