// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! File watcher for the project directory.
//!
//! Watches `notes/`, `references/`, and `.notesapp/ai-context/` for external
//! changes (deletions, renames) and notifies the frontend so bound tiles can
//! transition to Missing mode per SPEC.md §5.5.

use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const DEBOUNCE_MS: u64 = 500;

/// Event payload emitted to the frontend via Tauri's event system.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileChangeEvent {
    /// "delete" or "rename" or "modify"
    pub kind: String,
    /// Absolute path of the affected file
    pub path: String,
}

/// Start watching the project directory for file changes.
/// Emits `file-change` events to the frontend.
pub fn start_watcher(
    app: AppHandle,
    project_dir: PathBuf,
) -> Result<(), String> {
    let dirs_to_watch: Vec<PathBuf> = vec![
        project_dir.join("notes"),
        project_dir.join("references"),
        project_dir.join(".notesapp").join("ai-context"),
    ];

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();

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
                        if let Some(kind) = kind {
                            let payload = FileChangeEvent {
                                kind,
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
    // notify-debouncer-mini doesn't distinguish event types clearly,
    // so we check if the file still exists
    if !event.path.exists() {
        Some("delete".to_string())
    } else {
        Some("modify".to_string())
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
}
