// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tauri commands for browsing and importing reference documents.
//!
//! Reference documents live in `<project-dir>/references/` and are never
//! modified by the app (per SPEC.md §5.3). PDF annotation highlights are
//! stored in `<filename>.pdf.annotations` sidecar JSON files.

use std::path::{Path, PathBuf};

use crate::AppError;

/// A reference document entry returned by `list_references`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ReferenceEntry {
    /// Filename without directory (e.g. `"paper.pdf"`).
    pub name: String,
    /// Absolute path to the file.
    pub path: String,
    /// File extension, lowercase, without the dot (e.g. `"pdf"`, `"md"`).
    pub extension: String,
    /// Last modification time as Unix milliseconds.
    pub modified: i64,
    /// File size in bytes.
    pub size: u64,
}

/// List all files in `<project_dir>/references/`, sorted by modification time
/// descending (most recently modified first).
#[tauri::command]
pub fn list_references(project_dir: String) -> Result<Vec<ReferenceEntry>, AppError> {
    let refs_dir = PathBuf::from(&project_dir).join("references");
    if !refs_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut entries: Vec<ReferenceEntry> = std::fs::read_dir(&refs_dir)?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            // Skip annotation sidecars from the reference list
            if name.ends_with(".pdf.annotations") {
                return None;
            }
            let path = e.path().to_string_lossy().into_owned();
            let ext = e
                .path()
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_lowercase();
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|d| d.as_millis() as i64)
                })
                .unwrap_or(0);
            let size = meta.len();
            Some(ReferenceEntry {
                name,
                path,
                extension: ext,
                modified,
                size,
            })
        })
        .collect();

    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

/// Read the text content of a markdown reference file.
/// For PDF files, returns an empty string (PDFs are rendered by PDF.js on
/// the frontend, not read through this command).
#[tauri::command]
pub fn read_reference(path: String) -> Result<String, AppError> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(AppError::Project(format!(
            "Reference file not found: {}",
            path
        )));
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext == "pdf" {
        return Ok(String::new());
    }
    Ok(std::fs::read_to_string(&p)?)
}

/// Copy a file from the OS filesystem into `<project_dir>/references/`.
///
/// Handles name collisions by appending ` (2)`, ` (3)`, etc. before the
/// extension. Never overwrites existing files.
/// Returns the `ReferenceEntry` for the newly imported file.
#[tauri::command]
pub fn import_reference(project_dir: String, src_path: String) -> Result<ReferenceEntry, AppError> {
    let src = PathBuf::from(&src_path);
    if !src.is_file() {
        return Err(AppError::Project(format!(
            "Source file not found: {}",
            src_path
        )));
    }

    let refs_dir = PathBuf::from(&project_dir).join("references");
    if !refs_dir.exists() {
        std::fs::create_dir_all(&refs_dir)?;
    }

    let original_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Project("Source path has no filename".to_string()))?
        .to_string();

    let dest_path = unique_dest_path(&refs_dir, &original_name);
    std::fs::copy(&src, &dest_path)?;

    let name = dest_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&original_name)
        .to_string();
    let ext = dest_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let meta = std::fs::metadata(&dest_path)?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_millis() as i64)
        })
        .unwrap_or(0);

    Ok(ReferenceEntry {
        name,
        path: dest_path.to_string_lossy().into_owned(),
        extension: ext,
        modified,
        size: meta.len(),
    })
}

/// Read the JSON content of a PDF annotation sidecar file (`<pdf>.annotations`).
/// Returns an empty JSON array string `"[]"` if the file does not exist yet.
#[tauri::command]
pub fn read_pdf_annotations(pdf_path: String) -> Result<String, AppError> {
    let ann_path = annotation_path(&pdf_path);
    if !ann_path.is_file() {
        return Ok("[]".to_string());
    }
    Ok(std::fs::read_to_string(&ann_path)?)
}

/// Write (overwrite) the JSON content of a PDF annotation sidecar file.
#[tauri::command]
pub fn write_pdf_annotations(pdf_path: String, content: String) -> Result<(), AppError> {
    let ann_path = annotation_path(&pdf_path);
    if let Some(parent) = ann_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&ann_path, content)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn annotation_path(pdf_path: &str) -> PathBuf {
    PathBuf::from(format!("{}.annotations", pdf_path))
}

/// Return a destination path under `dir` for a file named `name`, appending
/// ` (N)` before the extension if needed to avoid collisions.
fn unique_dest_path(dir: &Path, name: &str) -> PathBuf {
    let dest = dir.join(name);
    if !dest.exists() {
        return dest;
    }

    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_default();

    for n in 2u32.. {
        let candidate_name = format!("{} ({}){}", stem, n, ext);
        let candidate = dir.join(&candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    // Unreachable in practice
    dir.join(name)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_project(tmp: &TempDir) -> String {
        let dir = tmp.path().to_string_lossy().into_owned();
        std::fs::create_dir_all(tmp.path().join("references")).unwrap();
        dir
    }

    #[test]
    fn list_references_empty_dir() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        let refs = list_references(dir).unwrap();
        assert!(refs.is_empty());
    }

    #[test]
    fn list_references_excludes_annotations() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        std::fs::write(tmp.path().join("references/paper.pdf"), b"%PDF-1.0").unwrap();
        std::fs::write(
            tmp.path().join("references/paper.pdf.annotations"),
            "[]",
        )
        .unwrap();
        let refs = list_references(dir).unwrap();
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].name, "paper.pdf");
    }

    #[test]
    fn list_references_sorted_by_modified() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        // Write files with a small sleep so mtimes differ
        std::fs::write(tmp.path().join("references/a.md"), "first").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(50));
        std::fs::write(tmp.path().join("references/b.md"), "second").unwrap();
        let refs = list_references(dir).unwrap();
        assert_eq!(refs.len(), 2);
        // Most recently modified first
        assert_eq!(refs[0].name, "b.md");
        assert_eq!(refs[1].name, "a.md");
    }

    #[test]
    fn read_reference_markdown() {
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("paper.md");
        std::fs::write(&p, "# Hello").unwrap();
        let content = read_reference(p.to_string_lossy().into_owned()).unwrap();
        assert_eq!(content, "# Hello");
    }

    #[test]
    fn read_reference_pdf_returns_empty_string() {
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("paper.pdf");
        std::fs::write(&p, b"%PDF-1.0").unwrap();
        let content = read_reference(p.to_string_lossy().into_owned()).unwrap();
        assert_eq!(content, "");
    }

    #[test]
    fn read_reference_missing_returns_error() {
        let result = read_reference("/nonexistent/paper.md".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn import_reference_copies_file() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        // Create source file
        let src_dir = TempDir::new().unwrap();
        let src = src_dir.path().join("paper.pdf");
        std::fs::write(&src, b"%PDF-1.0").unwrap();

        let entry = import_reference(dir.clone(), src.to_string_lossy().into_owned()).unwrap();
        assert_eq!(entry.name, "paper.pdf");
        assert!(PathBuf::from(&entry.path).is_file());
        assert!(entry.path.contains("references"));
    }

    #[test]
    fn import_reference_collision_suffixing() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        // Pre-create a file in references/
        std::fs::write(tmp.path().join("references/paper.pdf"), b"%PDF-1.0").unwrap();

        let src_dir = TempDir::new().unwrap();
        let src = src_dir.path().join("paper.pdf");
        std::fs::write(&src, b"%PDF-1.1").unwrap();

        let entry = import_reference(dir, src.to_string_lossy().into_owned()).unwrap();
        assert_eq!(entry.name, "paper (2).pdf");
    }

    #[test]
    fn import_reference_collision_suffixing_triple() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        std::fs::write(tmp.path().join("references/doc.md"), "v1").unwrap();
        std::fs::write(tmp.path().join("references/doc (2).md"), "v2").unwrap();

        let src_dir = TempDir::new().unwrap();
        let src = src_dir.path().join("doc.md");
        std::fs::write(&src, "v3").unwrap();

        let entry = import_reference(dir, src.to_string_lossy().into_owned()).unwrap();
        assert_eq!(entry.name, "doc (3).md");
    }

    #[test]
    fn pdf_annotations_round_trip() {
        let tmp = TempDir::new().unwrap();
        let pdf_path = tmp.path().join("paper.pdf").to_string_lossy().into_owned();

        // No sidecar yet → empty array
        let initial = read_pdf_annotations(pdf_path.clone()).unwrap();
        assert_eq!(initial, "[]");

        // Write some annotations
        let data = r#"[{"page":1,"text":"important"}]"#;
        write_pdf_annotations(pdf_path.clone(), data.to_string()).unwrap();

        // Read back
        let read_back = read_pdf_annotations(pdf_path).unwrap();
        assert_eq!(read_back, data);
    }

    #[test]
    fn unique_dest_path_no_collision() {
        let tmp = TempDir::new().unwrap();
        let p = unique_dest_path(tmp.path(), "paper.pdf");
        assert_eq!(p, tmp.path().join("paper.pdf"));
    }

    #[test]
    fn unique_dest_path_with_collision() {
        let tmp = TempDir::new().unwrap();
        std::fs::write(tmp.path().join("paper.pdf"), "").unwrap();
        let p = unique_dest_path(tmp.path(), "paper.pdf");
        assert_eq!(p, tmp.path().join("paper (2).pdf"));
    }
}
