// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri commands for reading and writing note files.

use std::path::PathBuf;

use crate::AppError;

/// Read the content of a note file.
#[tauri::command]
pub fn read_note(path: String) -> Result<String, AppError> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(AppError::Project(format!("File not found: {}", path)));
    }
    let content = std::fs::read_to_string(&p)?;
    Ok(content)
}

/// Write (overwrite) a note file.
#[tauri::command]
pub fn write_note(path: String, content: String) -> Result<(), AppError> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&p, content)?;
    Ok(())
}

/// Write content to a `.tmp` autosave file alongside the note.
/// The `.tmp` path is derived by replacing the extension with `.tmp`.
#[tauri::command]
pub fn autosave_note(path: String, content: String) -> Result<(), AppError> {
    let md_path = PathBuf::from(&path);
    let tmp_path = md_path.with_extension("tmp");
    std::fs::write(&tmp_path, content)?;
    Ok(())
}

/// Delete the `.tmp` crash-recovery file for a note (after user saves or discards).
#[tauri::command]
pub fn delete_tmp(path: String) -> Result<(), AppError> {
    let md_path = PathBuf::from(&path);
    let tmp_path = md_path.with_extension("tmp");
    if tmp_path.exists() {
        std::fs::remove_file(&tmp_path)?;
    }
    Ok(())
}

/// Return whether the given filesystem path refers to an existing regular file.
/// Used by the frontend on layout restore to transition bindings whose files
/// have been deleted to `Missing` mode (SPEC.md §5.5).
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    PathBuf::from(&path).is_file()
}

/// Create a new note file and return its path.
///
/// If `name` has no extension, `.md` is appended automatically (SPEC.md §6.2).
/// If `name` already has an extension, it is used verbatim.
/// `.md` files are created with standard front-matter; other text files are empty.
#[tauri::command]
pub fn create_note(project_dir: String, name: String) -> Result<String, AppError> {
    let notes_dir = PathBuf::from(&project_dir).join("notes");
    if !notes_dir.exists() {
        std::fs::create_dir_all(&notes_dir)?;
    }

    let filename = if name.contains('.') {
        name.clone()
    } else {
        format!("{}.md", name)
    };

    let note_path = notes_dir.join(&filename);
    if note_path.exists() {
        return Err(AppError::Project(format!(
            "Note already exists: {}",
            filename
        )));
    }

    let ext = note_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "md" {
        let title = note_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("untitled");
        let now = crate::fs::iso_now_public();
        let content = format!(
            "---\ntitle: \"{}\"\ncreated: {}\nmodified: {}\ntags: []\n---\n\n",
            title, now, now,
        );
        std::fs::write(&note_path, content)?;
    } else {
        std::fs::write(&note_path, "")?;
    }

    note_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Project("Invalid path encoding".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_write_round_trip() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("test.md").to_string_lossy().to_string();
        write_note(path.clone(), "# Hello".to_string()).unwrap();
        let content = read_note(path).unwrap();
        assert_eq!(content, "# Hello");
    }

    #[test]
    fn read_missing_file_returns_error() {
        let result = read_note("/nonexistent/path/note.md".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn autosave_creates_tmp() {
        let tmp = TempDir::new().unwrap();
        let md_path = tmp.path().join("note.md");
        let tmp_path = tmp.path().join("note.tmp");
        std::fs::write(&md_path, "").unwrap();
        autosave_note(md_path.to_string_lossy().to_string(), "draft".to_string()).unwrap();
        let content = std::fs::read_to_string(&tmp_path).unwrap();
        assert_eq!(content, "draft");
    }

    #[test]
    fn delete_tmp_removes_file() {
        let tmp = TempDir::new().unwrap();
        let md_path = tmp.path().join("note.md");
        let tmp_path = tmp.path().join("note.tmp");
        std::fs::write(&md_path, "").unwrap();
        std::fs::write(&tmp_path, "draft").unwrap();
        delete_tmp(md_path.to_string_lossy().to_string()).unwrap();
        assert!(!tmp_path.exists());
    }

    #[test]
    fn create_note_md_has_front_matter() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("notes")).unwrap();
        let path_str = create_note(
            tmp.path().to_string_lossy().to_string(),
            "my-note".to_string(),
        )
        .unwrap();
        let content = std::fs::read_to_string(&path_str).unwrap();
        assert!(path_str.ends_with("my-note.md"));
        assert!(content.starts_with("---\n"));
        assert!(content.contains("title: \"my-note\""));
    }

    #[test]
    fn create_note_txt_is_empty() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("notes")).unwrap();
        let path_str = create_note(
            tmp.path().to_string_lossy().to_string(),
            "data.txt".to_string(),
        )
        .unwrap();
        let content = std::fs::read_to_string(&path_str).unwrap();
        assert!(path_str.ends_with("data.txt"));
        assert!(content.is_empty());
    }

    #[test]
    fn file_exists_detects_file() {
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("note.md");
        assert!(!file_exists(p.to_string_lossy().to_string()));
        std::fs::write(&p, "").unwrap();
        assert!(file_exists(p.to_string_lossy().to_string()));
        // A directory should not count as a file
        assert!(!file_exists(tmp.path().to_string_lossy().to_string()));
    }

    #[test]
    fn create_note_rejects_duplicate() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("notes")).unwrap();
        create_note(
            tmp.path().to_string_lossy().to_string(),
            "dup".to_string(),
        )
        .unwrap();
        let result = create_note(
            tmp.path().to_string_lossy().to_string(),
            "dup".to_string(),
        );
        assert!(result.is_err());
    }
}
