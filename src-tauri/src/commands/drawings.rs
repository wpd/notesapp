// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri commands for Excalidraw drawing sidecar files.
//!
//! Sidecar naming: `<note-stem>.NNNN.drawing` where NNNN is 4-digit zero-padded.
//! Autosave files: `<sidecar-path>.tmp` (same pattern as note autosaves).

use std::path::{Path, PathBuf};

use crate::AppError;

/// Read the JSON content of a `.drawing` sidecar file.
#[tauri::command]
pub fn read_drawing(path: String) -> Result<String, AppError> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(AppError::Project(format!("Drawing not found: {}", path)));
    }
    Ok(std::fs::read_to_string(&p)?)
}

/// Write (overwrite) a `.drawing` sidecar file.
#[tauri::command]
pub fn write_drawing(path: String, content: String) -> Result<(), AppError> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&p, content)?;
    Ok(())
}

/// Delete a `.drawing` sidecar file (orphan numbers are tolerated; gaps preserved).
#[tauri::command]
pub fn delete_drawing(path: String) -> Result<(), AppError> {
    let p = PathBuf::from(&path);
    if p.exists() {
        std::fs::remove_file(&p)?;
    }
    Ok(())
}

/// Write a `.drawing.tmp` autosave file for a sidecar.
#[tauri::command]
pub fn autosave_drawing(path: String, content: String) -> Result<(), AppError> {
    let tmp_path = format!("{}.tmp", path);
    std::fs::write(&tmp_path, content)?;
    Ok(())
}

/// Delete the `.drawing.tmp` autosave file after a save or discard.
#[tauri::command]
pub fn delete_drawing_tmp(path: String) -> Result<(), AppError> {
    let tmp_path = format!("{}.tmp", path);
    let p = PathBuf::from(&tmp_path);
    if p.exists() {
        std::fs::remove_file(&p)?;
    }
    Ok(())
}

/// List all `.drawing` sidecar filenames (basename only) for the given note path.
///
/// Returns files matching `<note-stem>.NNNN.drawing` in the same directory.
/// Results are sorted by NNNN ascending.
#[tauri::command]
pub fn list_drawings(note_path: String) -> Result<Vec<String>, AppError> {
    let note = PathBuf::from(&note_path);
    let stem = note
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::Project("Cannot determine note stem".to_string()))?
        .to_string();
    let dir = note
        .parent()
        .unwrap_or_else(|| Path::new("."));

    let mut drawings: Vec<(u32, String)> = std::fs::read_dir(dir)?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            parse_drawing_number(&stem, &name).map(|n| (n, name))
        })
        .collect();

    drawings.sort_by_key(|(n, _)| *n);
    Ok(drawings.into_iter().map(|(_, name)| name).collect())
}

/// Return the next available NNNN for a new drawing sidecar for the given note.
///
/// Scans existing `<stem>.NNNN.drawing` files; returns `max(NNNN) + 1` or `1`
/// if none exist. Gaps are preserved — previously used numbers are never reused.
#[tauri::command]
pub fn next_drawing_number(note_path: String) -> Result<u32, AppError> {
    let note = PathBuf::from(&note_path);
    let stem = note
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::Project("Cannot determine note stem".to_string()))?
        .to_string();
    let dir = note
        .parent()
        .unwrap_or_else(|| Path::new("."));

    let max = std::fs::read_dir(dir)?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            parse_drawing_number(&stem, &name)
        })
        .max()
        .unwrap_or(0);

    Ok(max + 1)
}

/// Return the sidecar path for a given note path and NNNN number.
///
/// Exposed so the frontend can compute a stable path before creating the file.
#[tauri::command]
pub fn drawing_path(note_path: String, number: u32) -> Result<String, AppError> {
    let note = PathBuf::from(&note_path);
    let stem = note
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::Project("Cannot determine note stem".to_string()))?
        .to_string();
    let dir = note
        .parent()
        .unwrap_or_else(|| Path::new("."));
    let filename = format!("{}.{:04}.drawing", stem, number);
    let full = dir.join(&filename);
    Ok(full.to_string_lossy().into_owned())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Parse the NNNN number from a filename matching `<stem>.NNNN.drawing`.
/// Returns `None` if the filename doesn't match.
fn parse_drawing_number(stem: &str, filename: &str) -> Option<u32> {
    // Expected pattern: "<stem>.<4-digits>.drawing"
    let prefix = format!("{}.", stem);
    let suffix = ".drawing";
    if !filename.starts_with(&prefix) || !filename.ends_with(suffix) {
        return None;
    }
    let middle = &filename[prefix.len()..filename.len() - suffix.len()];
    if middle.len() == 4 && middle.chars().all(|c| c.is_ascii_digit()) {
        middle.parse::<u32>().ok()
    } else {
        None
    }
}

// ── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let note = dir.path().join("my-note.md");
        fs::write(&note, "# Test").unwrap();
        (dir, note)
    }

    #[test]
    fn parse_drawing_number_valid() {
        assert_eq!(parse_drawing_number("note", "note.0001.drawing"), Some(1));
        assert_eq!(parse_drawing_number("note", "note.0042.drawing"), Some(42));
        assert_eq!(parse_drawing_number("note", "note.9999.drawing"), Some(9999));
    }

    #[test]
    fn parse_drawing_number_invalid() {
        assert_eq!(parse_drawing_number("note", "other.0001.drawing"), None);
        assert_eq!(parse_drawing_number("note", "note.001.drawing"), None);
        assert_eq!(parse_drawing_number("note", "note.0001.txt"), None);
        assert_eq!(parse_drawing_number("note", "note.abcd.drawing"), None);
        assert_eq!(parse_drawing_number("note", "note.0001.drawing.tmp"), None);
    }

    #[test]
    fn next_drawing_number_empty_dir() {
        let (_dir, note) = setup();
        let n = next_drawing_number(note.to_string_lossy().into_owned()).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn next_drawing_number_with_existing() {
        let (dir, note) = setup();
        fs::write(dir.path().join("my-note.0001.drawing"), "{}").unwrap();
        fs::write(dir.path().join("my-note.0003.drawing"), "{}").unwrap();
        let n = next_drawing_number(note.to_string_lossy().into_owned()).unwrap();
        // gap preserved: next is max+1 = 4, not 2
        assert_eq!(n, 4);
    }

    #[test]
    fn list_drawings_sorted() {
        let (dir, note) = setup();
        fs::write(dir.path().join("my-note.0003.drawing"), "{}").unwrap();
        fs::write(dir.path().join("my-note.0001.drawing"), "{}").unwrap();
        fs::write(dir.path().join("my-note.0002.drawing"), "{}").unwrap();
        let list = list_drawings(note.to_string_lossy().into_owned()).unwrap();
        assert_eq!(
            list,
            vec!["my-note.0001.drawing", "my-note.0002.drawing", "my-note.0003.drawing"]
        );
    }

    #[test]
    fn drawing_path_formats_correctly() {
        let (_dir, note) = setup();
        let path = drawing_path(note.to_string_lossy().into_owned(), 7).unwrap();
        assert!(path.ends_with("my-note.0007.drawing"));
    }

    #[test]
    fn read_write_drawing_roundtrip() {
        let (dir, note) = setup();
        let sidecar = dir.path().join("my-note.0001.drawing");
        let content = r#"{"type":"excalidraw","version":2,"elements":[]}"#;
        write_drawing(sidecar.to_string_lossy().into_owned(), content.to_string()).unwrap();
        let read_back = read_drawing(sidecar.to_string_lossy().into_owned()).unwrap();
        assert_eq!(read_back, content);
        delete_drawing(sidecar.to_string_lossy().into_owned()).unwrap();
        assert!(!sidecar.exists());
        let _ = note; // keep dir alive
    }

    #[test]
    fn autosave_and_delete_tmp() {
        let (dir, note) = setup();
        let sidecar = dir.path().join("my-note.0001.drawing");
        let tmp = dir.path().join("my-note.0001.drawing.tmp");
        autosave_drawing(sidecar.to_string_lossy().into_owned(), "{}".to_string()).unwrap();
        assert!(tmp.exists());
        delete_drawing_tmp(sidecar.to_string_lossy().into_owned()).unwrap();
        assert!(!tmp.exists());
        let _ = note;
    }
}
