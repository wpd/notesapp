// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! File-system helpers for the NotesApp project directory.

use std::path::{Path, PathBuf};

use crate::AppError;

/// The scaffold that is created inside a project directory on first open.
const NOTES_DIR: &str = "notes";
const REFERENCES_DIR: &str = "references";
const ATTACHMENTS_DIR: &str = "attachments";
const NOTESAPP_DIR: &str = ".notesapp";
const PROJECT_TOML: &str = "project.toml";

/// A single note entry as returned to the frontend.
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq)]
pub struct NoteEntry {
    /// Absolute path to the note file.
    pub path: PathBuf,
    /// File name without the `.md` extension.
    pub name: String,
    /// Modification time as Unix timestamp (seconds).
    pub modified_at: u64,
}

/// Validate that `dir` is an accessible directory; create the `.notesapp/`
/// scaffold inside it if it does not already exist.
pub fn init_project_dir(dir: &Path) -> Result<(), AppError> {
    if !dir.is_dir() {
        return Err(AppError::Project(format!(
            "Project path is not a directory: {}",
            dir.display()
        )));
    }

    let notesapp_dir = dir.join(NOTESAPP_DIR);
    if !notesapp_dir.exists() {
        std::fs::create_dir_all(&notesapp_dir)?;
    }

    let project_toml = notesapp_dir.join(PROJECT_TOML);
    if !project_toml.exists() {
        let defaults = default_project_toml();
        std::fs::write(&project_toml, defaults)?;
    }

    for sub in [NOTES_DIR, REFERENCES_DIR, ATTACHMENTS_DIR] {
        let sub_dir = dir.join(sub);
        if !sub_dir.exists() {
            std::fs::create_dir_all(&sub_dir)?;
        }
    }

    Ok(())
}

/// Return the default contents of `project.toml`.
fn default_project_toml() -> String {
    format!(
        "# SPDX-License-Identifier: MIT\n\
         # Copyright (c) 2026 NotesApp Contributors\n\
         # Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude\n\
         \n\
         [project]\n\
         name = \"My Notes\"\n\
         version = \"1\"\n\
         created = \"{}\"\n",
        chrono_now()
    )
}

fn chrono_now() -> String {
    // Use std::time to avoid pulling in the chrono crate at this stage.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    secs.to_string()
}

/// Scan `dir/notes/` and return all `.md` files sorted by modification time
/// (most recently modified first).
pub fn list_notes(project_dir: &Path) -> Result<Vec<NoteEntry>, AppError> {
    let notes_dir = project_dir.join(NOTES_DIR);
    if !notes_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&notes_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let modified_at = entry
                .metadata()?
                .modified()?
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            entries.push(NoteEntry {
                path,
                name,
                modified_at,
            });
        }
    }

    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(entries)
}

/// Detect `.tmp` crash-recovery files alongside `.md` files in `notes/`.
pub fn find_recovery_files(project_dir: &Path) -> Result<Vec<PathBuf>, AppError> {
    let notes_dir = project_dir.join(NOTES_DIR);
    if !notes_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut tmps = Vec::new();
    for entry in std::fs::read_dir(&notes_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("tmp") {
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let md_sibling = notes_dir.join(format!("{}.md", stem));
            if md_sibling.exists() {
                tmps.push(path);
            }
        }
    }
    Ok(tmps)
}

/// Read the `layout.json` from `.notesapp/layout.json`, if it exists.
pub fn read_layout(project_dir: &Path) -> Result<Option<serde_json::Value>, AppError> {
    let layout_path = project_dir.join(NOTESAPP_DIR).join("layout.json");
    if !layout_path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&layout_path)?;
    let value = serde_json::from_str(&raw)?;
    Ok(Some(value))
}

/// Persist a layout value to `.notesapp/layout.json`.
pub fn write_layout(project_dir: &Path, layout: &serde_json::Value) -> Result<(), AppError> {
    let notesapp_dir = project_dir.join(NOTESAPP_DIR);
    if !notesapp_dir.exists() {
        std::fs::create_dir_all(&notesapp_dir)?;
    }
    let layout_path = notesapp_dir.join("layout.json");
    let raw = serde_json::to_string_pretty(layout)?;
    std::fs::write(&layout_path, raw)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_temp_project() -> TempDir {
        let tmp = TempDir::new().unwrap();
        init_project_dir(tmp.path()).unwrap();
        tmp
    }

    #[test]
    fn init_creates_scaffold() {
        let tmp = make_temp_project();
        let dir = tmp.path();

        assert!(dir.join(".notesapp").is_dir(), ".notesapp dir missing");
        assert!(
            dir.join(".notesapp/project.toml").is_file(),
            "project.toml missing"
        );
        assert!(dir.join("notes").is_dir(), "notes dir missing");
        assert!(dir.join("references").is_dir(), "references dir missing");
        assert!(dir.join("attachments").is_dir(), "attachments dir missing");
    }

    #[test]
    fn init_is_idempotent() {
        let tmp = make_temp_project();
        // Should not error on second call
        init_project_dir(tmp.path()).unwrap();
        assert!(tmp.path().join("notes").is_dir());
    }

    #[test]
    fn init_rejects_non_directory() {
        let tmp = TempDir::new().unwrap();
        let not_a_dir = tmp.path().join("not_a_dir");
        let result = init_project_dir(&not_a_dir);
        assert!(result.is_err());
    }

    #[test]
    fn list_notes_empty_directory() {
        let tmp = make_temp_project();
        let notes = list_notes(tmp.path()).unwrap();
        assert!(notes.is_empty());
    }

    #[test]
    fn list_notes_finds_md_files() {
        let tmp = make_temp_project();
        let notes_dir = tmp.path().join("notes");
        std::fs::write(notes_dir.join("alpha.md"), "# Alpha").unwrap();
        std::fs::write(notes_dir.join("beta.md"), "# Beta").unwrap();
        // .txt should be ignored
        std::fs::write(notes_dir.join("ignore.txt"), "ignored").unwrap();

        let notes = list_notes(tmp.path()).unwrap();
        assert_eq!(notes.len(), 2);
        let names: Vec<_> = notes.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"alpha"));
        assert!(names.contains(&"beta"));
    }

    #[test]
    fn find_recovery_files_detects_tmp_with_md_sibling() {
        let tmp = make_temp_project();
        let notes_dir = tmp.path().join("notes");
        std::fs::write(notes_dir.join("note.md"), "# Note").unwrap();
        std::fs::write(notes_dir.join("note.tmp"), "# Note draft").unwrap();
        // tmp without md sibling should be ignored
        std::fs::write(notes_dir.join("orphan.tmp"), "orphan").unwrap();

        let recoveries = find_recovery_files(tmp.path()).unwrap();
        assert_eq!(recoveries.len(), 1);
        assert!(recoveries[0].file_name().unwrap() == "note.tmp");
    }

    #[test]
    fn layout_round_trip() {
        let tmp = make_temp_project();
        let layout = serde_json::json!({ "type": "leaf", "id": "editor-1" });
        write_layout(tmp.path(), &layout).unwrap();
        let read_back = read_layout(tmp.path()).unwrap();
        assert_eq!(read_back, Some(layout));
    }

    #[test]
    fn read_layout_returns_none_when_missing() {
        let tmp = make_temp_project();
        let result = read_layout(tmp.path()).unwrap();
        assert!(result.is_none());
    }
}
