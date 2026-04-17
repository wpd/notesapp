// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri commands for layout persistence and project directory detection.

use crate::{fs as notesfs, AppError};

/// Return the value of `NOTESAPP_PROJECT_DIR` env var, or `None` if not set.
#[tauri::command]
pub fn get_project_dir_env() -> Option<String> {
    std::env::var("NOTESAPP_PROJECT_DIR").ok()
}

/// Save the window layout JSON to `.notesapp/layout.json`.
#[tauri::command]
pub fn save_layout(project_dir: String, layout_json: String) -> Result<(), AppError> {
    let dir = std::path::PathBuf::from(&project_dir);
    let value: serde_json::Value = serde_json::from_str(&layout_json)?;
    notesfs::write_layout(&dir, &value)?;
    Ok(())
}

/// Load the window layout from `.notesapp/layout.json`.
/// Returns `None` if the file does not exist yet.
#[tauri::command]
pub fn load_layout(project_dir: String) -> Result<Option<String>, AppError> {
    let dir = std::path::PathBuf::from(&project_dir);
    match notesfs::read_layout(&dir)? {
        Some(value) => {
            let json = serde_json::to_string(&value)?;
            Ok(Some(json))
        }
        None => Ok(None),
    }
}

/// Return paths of any `.tmp` crash-recovery files found alongside `.md` notes.
#[tauri::command]
pub fn find_recovery_files(project_dir: String) -> Result<Vec<String>, AppError> {
    let dir = std::path::PathBuf::from(&project_dir);
    let paths = notesfs::find_recovery_files(&dir)?;
    Ok(paths
        .into_iter()
        .filter_map(|p| p.to_str().map(|s| s.to_string()))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_project(tmp: &TempDir) {
        crate::fs::init_project_dir(tmp.path()).unwrap();
    }

    #[test]
    fn save_load_layout_round_trip() {
        let tmp = TempDir::new().unwrap();
        make_project(&tmp);
        let layout = r#"{"type":"leaf","id":"editor-1"}"#;
        save_layout(
            tmp.path().to_string_lossy().to_string(),
            layout.to_string(),
        )
        .unwrap();
        let loaded = load_layout(tmp.path().to_string_lossy().to_string())
            .unwrap()
            .unwrap();
        let v1: serde_json::Value = serde_json::from_str(layout).unwrap();
        let v2: serde_json::Value = serde_json::from_str(&loaded).unwrap();
        assert_eq!(v1, v2);
    }

    #[test]
    fn load_layout_returns_none_when_missing() {
        let tmp = TempDir::new().unwrap();
        make_project(&tmp);
        let result = load_layout(tmp.path().to_string_lossy().to_string()).unwrap();
        assert!(result.is_none());
    }
}
