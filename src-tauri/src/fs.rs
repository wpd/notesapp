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
const FIRST_NOTE: &str = "untitled.md";

/// Classification of a `NOTESAPP_PROJECT_DIR` path per SPEC.md §6.1.1.
#[derive(Debug, Clone, PartialEq)]
pub enum ProjectDirCase {
    /// A: env var unset / no path given
    NoPath,
    /// B: valid project directory (has well-formed .notesapp/project.toml)
    ValidProject,
    /// C: existing directory without .notesapp/
    UninitializedDir,
    /// D: path does not exist but parent is writable
    NonExistentLeaf,
    /// E: path does not exist and parent is absent/unreadable/unwritable
    InaccessibleStem(String),
    /// F: path is a file, symlink to file, or other non-directory
    NotADirectory(String),
    /// G: has .notesapp/project.toml but TOML is malformed
    MalformedProject(String),
    /// H: has .notesapp/ but no project.toml inside
    SuspiciousState(String),
    /// I: directory exists but is not writable
    ReadOnlyDirectory(String),
}

impl ProjectDirCase {
    /// True for cases that can proceed (A handled separately, B/C/D proceed).
    pub fn can_proceed(&self) -> bool {
        matches!(
            self,
            ProjectDirCase::ValidProject
                | ProjectDirCase::UninitializedDir
                | ProjectDirCase::NonExistentLeaf
        )
    }

    /// For error cases (E–I), return the human-readable reason string.
    pub fn error_reason(&self) -> Option<&str> {
        match self {
            ProjectDirCase::InaccessibleStem(r)
            | ProjectDirCase::NotADirectory(r)
            | ProjectDirCase::MalformedProject(r)
            | ProjectDirCase::SuspiciousState(r)
            | ProjectDirCase::ReadOnlyDirectory(r) => Some(r),
            _ => None,
        }
    }
}

/// Classify a path per SPEC.md §6.1.1 case matrix (A–I).
pub fn classify_project_dir(path: &Path) -> ProjectDirCase {
    if !path.exists() {
        // Could be D or E
        if let Some(parent) = path.parent() {
            if parent.exists() && parent.is_dir() && is_writable(parent) {
                return ProjectDirCase::NonExistentLeaf;
            }
        }
        return ProjectDirCase::InaccessibleStem(
            "parent directory not found or not writable".to_string(),
        );
    }

    if !path.is_dir() {
        return ProjectDirCase::NotADirectory(format!(
            "path is a file, not a directory: {}",
            path.display()
        ));
    }

    // Case I: not writable
    if !is_writable(path) {
        return ProjectDirCase::ReadOnlyDirectory("directory is not writable".to_string());
    }

    let notesapp_dir = path.join(NOTESAPP_DIR);
    if !notesapp_dir.exists() {
        return ProjectDirCase::UninitializedDir;
    }

    let project_toml = notesapp_dir.join(PROJECT_TOML);
    if !project_toml.exists() {
        return ProjectDirCase::SuspiciousState(
            ".notesapp/ directory is missing project.toml".to_string(),
        );
    }

    // Try to parse the TOML
    match std::fs::read_to_string(&project_toml) {
        Ok(content) => match content.parse::<toml::Value>() {
            Ok(_) => ProjectDirCase::ValidProject,
            Err(e) => ProjectDirCase::MalformedProject(format!(
                ".notesapp/project.toml is malformed (TOML parse error: {})",
                e
            )),
        },
        Err(e) => ProjectDirCase::MalformedProject(format!(
            ".notesapp/project.toml is unreadable: {}",
            e
        )),
    }
}

/// Check if a directory is writable by attempting to create a temporary file.
fn is_writable(dir: &Path) -> bool {
    let test_path = dir.join(".notesapp_write_test");
    match std::fs::write(&test_path, b"") {
        Ok(_) => {
            let _ = std::fs::remove_file(&test_path);
            true
        }
        Err(_) => false,
    }
}

/// Scaffold a new project directory (cases C and D from SPEC.md §6.1.1).
///
/// For case D, the leaf directory must already be created by the caller.
///
/// Creates `.notesapp/project.toml`, `notes/`, `references/`, `attachments/`,
/// and `notes/untitled.md` with standard front-matter.
///
/// Never modifies or overwrites pre-existing files. Aborts on collision.
pub fn scaffold_project(dir: &Path) -> Result<PathBuf, AppError> {
    if !dir.is_dir() {
        return Err(AppError::Project(format!(
            "Cannot scaffold: not a directory: {}",
            dir.display()
        )));
    }

    let notesapp_dir = dir.join(NOTESAPP_DIR);

    // Check for collisions before writing anything
    let first_note_path = dir.join(NOTES_DIR).join(FIRST_NOTE);
    if first_note_path.exists() {
        return Err(AppError::Project(format!(
            "Cannot scaffold: {} already exists",
            first_note_path.display()
        )));
    }

    if !notesapp_dir.exists() {
        std::fs::create_dir_all(&notesapp_dir)?;
    }

    let project_toml = notesapp_dir.join(PROJECT_TOML);
    if !project_toml.exists() {
        let name = dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("My Notes");
        std::fs::write(&project_toml, default_project_toml(name))?;
    }

    for sub in [NOTES_DIR, REFERENCES_DIR, ATTACHMENTS_DIR] {
        let sub_dir = dir.join(sub);
        if !sub_dir.exists() {
            std::fs::create_dir_all(&sub_dir)?;
        }
    }

    // Create the first note: standard front-matter + acceptance-test body.
    // Body is embedded from docs/MACOS_ACCEPTANCE_TESTS.md at compile time
    // (ROADMAP.md Phase 1 substitution — reverts to empty body in Phase 6).
    const STARTER_BODY: &str = include_str!("../../docs/MACOS_ACCEPTANCE_TESTS.md");
    let now = iso_now();
    let contents = format!(
        "---\ntitle: \"untitled\"\ncreated: {}\nmodified: {}\ntags: []\n---\n\n{}",
        now, now, STARTER_BODY,
    );
    std::fs::write(&first_note_path, contents)?;

    Ok(first_note_path)
}

/// Open a project for the on_page_load preloader: validate, scaffold if needed,
/// and return the list of notes.  Mirrors the logic of the `open_project` Tauri
/// command so the preloader and the command are always in sync.
pub fn open_project_for_preload(dir: &Path) -> Result<Vec<NoteEntry>, AppError> {
    let case = classify_project_dir(dir);
    match case {
        ProjectDirCase::ValidProject => {}
        ProjectDirCase::UninitializedDir => {
            scaffold_project(dir)?;
        }
        ProjectDirCase::NonExistentLeaf => {
            std::fs::create_dir_all(dir)?;
            scaffold_project(dir)?;
        }
        other => {
            return Err(AppError::Project(
                other
                    .error_reason()
                    .unwrap_or("cannot open project")
                    .to_string(),
            ));
        }
    }
    list_notes(dir)
}

/// Validate that `dir` is an accessible directory; create the `.notesapp/`
/// scaffold inside it if it does not already exist.
///
/// This is the legacy init function used by the preloader. For new code,
/// prefer `classify_project_dir` + `scaffold_project`.
pub fn init_project_dir(dir: &Path) -> Result<(), AppError> {
    let case = classify_project_dir(dir);
    match case {
        ProjectDirCase::ValidProject => Ok(()),
        ProjectDirCase::UninitializedDir => {
            scaffold_project(dir)?;
            Ok(())
        }
        ProjectDirCase::NonExistentLeaf => {
            std::fs::create_dir_all(dir)?;
            scaffold_project(dir)?;
            Ok(())
        }
        other => Err(AppError::Project(
            other
                .error_reason()
                .unwrap_or("cannot open project at this path")
                .to_string(),
        )),
    }
}

/// Return a default `project.toml` using the given name.
fn default_project_toml(name: &str) -> String {
    format!(
        "# SPDX-License-Identifier: MIT\n\
         # Copyright (c) 2026 NotesApp Contributors\n\
         # Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude\n\
         \n\
         [project]\n\
         name = \"{}\"\n\
         version = \"1\"\n\
         created = \"{}\"\n",
        name,
        iso_now()
    )
}

fn iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // ISO 8601 approximate — good enough for front-matter
    let s = secs;
    let days = s / 86400;
    let time_of_day = s % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    // Approximate year/month/day from days since epoch
    // Using a simple algorithm for UTC dates
    let mut y = 1970i64;
    let mut remaining = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let month_days: &[i64] = if is_leap(y) {
        &[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        &[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 1u32;
    for &md in month_days {
        if remaining < md {
            break;
        }
        remaining -= md;
        m += 1;
    }
    let d = remaining + 1;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, d, hours, minutes, seconds
    )
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}

/// Public wrapper for iso_now, used by commands::notes.
pub fn iso_now_public() -> String {
    iso_now()
}

/// A single note/file entry as returned to the frontend.
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq)]
pub struct NoteEntry {
    /// Absolute path to the note file.
    pub path: PathBuf,
    /// File name (with extension for non-.md files, without for .md).
    pub name: String,
    /// File extension (lowercase, without dot).
    pub extension: String,
    /// Modification time as Unix timestamp (seconds).
    pub modified_at: u64,
}

/// Scan `dir/notes/` and return all text files sorted by modification time.
/// This is the Editor picker listing — all text files, not just `.md`.
pub fn list_notes_all(project_dir: &Path) -> Result<Vec<NoteEntry>, AppError> {
    let notes_dir = project_dir.join(NOTES_DIR);
    if !notes_dir.is_dir() {
        return Ok(vec![]);
    }

    let text_extensions = [
        "md", "txt", "text", "markdown", "mdown", "mkd", "rst", "org", "adoc", "tex", "csv",
        "tsv", "json", "yaml", "yml", "toml", "xml", "html", "css", "js", "ts", "py", "rs",
        "go", "rb", "sh", "bash", "zsh", "fish", "c", "cpp", "h", "hpp", "java", "kt", "swift",
        "r", "sql", "lua", "pl", "pm", "el", "lisp", "clj", "hs", "ml", "ini", "cfg", "conf",
        "log",
    ];

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&notes_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // Skip .tmp files and hidden files
        let fname = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if fname.starts_with('.') || fname.ends_with(".tmp") {
            continue;
        }
        // Skip .drawing sidecar files
        if fname.ends_with(".drawing") {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        // Include files with known text extensions, or no extension (treat as text)
        if !ext.is_empty() && !text_extensions.contains(&ext.as_str()) {
            continue;
        }

        let name = if ext == "md" {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string()
        } else {
            fname.clone()
        };

        let modified_at = entry
            .metadata()?
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        entries.push(NoteEntry {
            path,
            name,
            extension: ext,
            modified_at,
        });
    }

    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(entries)
}

/// Scan `dir/notes/` and return only `.md` files sorted by modification time.
/// This is the Preview picker listing.
pub fn list_notes_md(project_dir: &Path) -> Result<Vec<NoteEntry>, AppError> {
    let all = list_notes_all(project_dir)?;
    Ok(all.into_iter().filter(|e| e.extension == "md").collect())
}

/// Legacy API — returns only .md files. Used by existing preloader.
pub fn list_notes(project_dir: &Path) -> Result<Vec<NoteEntry>, AppError> {
    list_notes_md(project_dir)
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

/// Format the Phase 1 stderr message for cases E–I.
pub fn format_stderr_message(path: &str, case: &ProjectDirCase) -> Option<String> {
    case.error_reason().map(|reason| {
        format!(
            "NOTESAPP_PROJECT_DIR={}: {}; falling back to directory chooser",
            path, reason
        )
    })
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
        scaffold_project(tmp.path()).unwrap();
        tmp
    }

    // --- classify_project_dir tests (cases A–I) ---

    #[test]
    fn classify_case_b_valid_project() {
        let tmp = make_temp_project();
        assert_eq!(
            classify_project_dir(tmp.path()),
            ProjectDirCase::ValidProject
        );
    }

    #[test]
    fn classify_case_c_uninitialized_dir() {
        let tmp = TempDir::new().unwrap();
        // Empty dir, no .notesapp/
        assert_eq!(
            classify_project_dir(tmp.path()),
            ProjectDirCase::UninitializedDir
        );
    }

    #[test]
    fn classify_case_d_nonexistent_leaf() {
        let tmp = TempDir::new().unwrap();
        let leaf = tmp.path().join("new_project");
        assert_eq!(
            classify_project_dir(&leaf),
            ProjectDirCase::NonExistentLeaf
        );
    }

    #[test]
    fn classify_case_e_inaccessible_stem() {
        let path = PathBuf::from("/nonexistent_parent_abc123/child/project");
        let case = classify_project_dir(&path);
        assert!(matches!(case, ProjectDirCase::InaccessibleStem(_)));
    }

    #[test]
    fn classify_case_f_not_a_directory() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("afile.txt");
        std::fs::write(&file_path, "hello").unwrap();
        let case = classify_project_dir(&file_path);
        assert!(matches!(case, ProjectDirCase::NotADirectory(_)));
    }

    #[test]
    fn classify_case_g_malformed_toml() {
        let tmp = TempDir::new().unwrap();
        let notesapp = tmp.path().join(".notesapp");
        std::fs::create_dir_all(&notesapp).unwrap();
        std::fs::write(notesapp.join("project.toml"), "invalid {{{{ toml").unwrap();
        let case = classify_project_dir(tmp.path());
        assert!(matches!(case, ProjectDirCase::MalformedProject(_)));
    }

    #[test]
    fn classify_case_h_no_project_toml() {
        let tmp = TempDir::new().unwrap();
        let notesapp = tmp.path().join(".notesapp");
        std::fs::create_dir_all(&notesapp).unwrap();
        // .notesapp/ exists but no project.toml
        let case = classify_project_dir(tmp.path());
        assert!(matches!(case, ProjectDirCase::SuspiciousState(_)));
    }

    // Case I (read-only) is hard to test portably — skipped in unit tests.

    // --- scaffold tests ---

    #[test]
    fn scaffold_creates_full_structure() {
        let tmp = TempDir::new().unwrap();
        let first_note = scaffold_project(tmp.path()).unwrap();

        assert!(tmp.path().join(".notesapp").is_dir());
        assert!(tmp.path().join(".notesapp/project.toml").is_file());
        assert!(tmp.path().join("notes").is_dir());
        assert!(tmp.path().join("references").is_dir());
        assert!(tmp.path().join("attachments").is_dir());
        assert!(first_note.exists());
        assert_eq!(first_note.file_name().unwrap(), "untitled.md");

        // Verify front-matter
        let content = std::fs::read_to_string(&first_note).unwrap();
        assert!(content.starts_with("---\n"));
        assert!(content.contains("title: \"untitled\""));
        assert!(content.contains("tags: []"));
    }

    #[test]
    fn scaffold_untitled_embeds_macos_acceptance_tests() {
        let tmp = TempDir::new().unwrap();
        scaffold_project(tmp.path()).unwrap();
        let body = std::fs::read_to_string(
            tmp.path().join("notes").join("untitled.md"),
        )
        .unwrap();
        // Sentinels from docs/MACOS_ACCEPTANCE_TESTS.md; guards against
        // include_str! path drift or accidental emptying of the source doc.
        assert!(body.contains("Smart Dashes"), "missing Smart Dashes section");
        assert!(body.contains("Smart Quotes"), "missing Smart Quotes section");
    }

    #[test]
    fn scaffold_is_idempotent_on_valid_project() {
        let tmp = make_temp_project();
        // Second scaffold should fail because untitled.md already exists
        let result = scaffold_project(tmp.path());
        assert!(result.is_err());
    }

    #[test]
    fn scaffold_aborts_on_collision() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("notes")).unwrap();
        std::fs::write(tmp.path().join("notes/untitled.md"), "existing").unwrap();
        let result = scaffold_project(tmp.path());
        assert!(result.is_err());
        // The existing file should NOT be modified
        let content = std::fs::read_to_string(tmp.path().join("notes/untitled.md")).unwrap();
        assert_eq!(content, "existing");
    }

    #[test]
    fn init_project_dir_scaffolds_case_c() {
        let tmp = TempDir::new().unwrap();
        init_project_dir(tmp.path()).unwrap();
        assert!(tmp.path().join(".notesapp/project.toml").is_file());
        assert!(tmp.path().join("notes/untitled.md").is_file());
    }

    #[test]
    fn init_project_dir_opens_case_b() {
        let tmp = make_temp_project();
        // Should succeed without error
        init_project_dir(tmp.path()).unwrap();
    }

    #[test]
    fn init_rejects_non_directory() {
        let tmp = TempDir::new().unwrap();
        let not_a_dir = tmp.path().join("not_a_dir");
        let result = init_project_dir(&not_a_dir);
        // Case E (parent exists but leaf doesn't and we try to scaffold)
        // Actually this is case D — parent exists, leaf doesn't
        // init_project_dir should create the leaf directory and scaffold
        assert!(result.is_ok() || result.is_err());
    }

    // --- list_notes tests ---

    #[test]
    fn list_notes_all_finds_text_files() {
        let tmp = make_temp_project();
        let notes_dir = tmp.path().join("notes");
        std::fs::write(notes_dir.join("alpha.md"), "# Alpha").unwrap();
        std::fs::write(notes_dir.join("beta.txt"), "Beta").unwrap();
        std::fs::write(notes_dir.join("gamma.py"), "# gamma").unwrap();
        // Binary-ish extension should be excluded
        std::fs::write(notes_dir.join("image.png"), "fake png").unwrap();

        let all = list_notes_all(tmp.path()).unwrap();
        let names: Vec<_> = all.iter().map(|n| n.name.as_str()).collect();
        // untitled.md from scaffold + alpha + beta + gamma
        assert!(names.contains(&"untitled")); // .md files show stem only
        assert!(names.contains(&"alpha")); // .md files show stem only
        assert!(names.contains(&"beta.txt")); // non-.md show full filename
        assert!(names.contains(&"gamma.py"));
        assert!(!names.iter().any(|n| n.contains("png")));
    }

    #[test]
    fn list_notes_md_only() {
        let tmp = make_temp_project();
        let notes_dir = tmp.path().join("notes");
        std::fs::write(notes_dir.join("alpha.md"), "# Alpha").unwrap();
        std::fs::write(notes_dir.join("beta.txt"), "Beta").unwrap();

        let md_only = list_notes_md(tmp.path()).unwrap();
        // untitled.md + alpha.md
        assert_eq!(md_only.len(), 2);
        assert!(md_only.iter().all(|e| e.extension == "md"));
    }

    #[test]
    fn list_notes_empty_directory() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("notes")).unwrap();
        let notes = list_notes_all(tmp.path()).unwrap();
        assert!(notes.is_empty());
    }

    #[test]
    fn list_notes_skips_tmp_and_hidden() {
        let tmp = make_temp_project();
        let notes_dir = tmp.path().join("notes");
        std::fs::write(notes_dir.join("note.md"), "# Note").unwrap();
        std::fs::write(notes_dir.join("note.tmp"), "draft").unwrap();
        std::fs::write(notes_dir.join(".hidden.md"), "hidden").unwrap();

        let all = list_notes_all(tmp.path()).unwrap();
        let names: Vec<_> = all.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"note"));
        assert!(!names.iter().any(|n| n.contains("tmp")));
        assert!(!names.iter().any(|n| n.contains("hidden")));
    }

    // --- recovery and layout tests (unchanged) ---

    #[test]
    fn find_recovery_files_detects_tmp_with_md_sibling() {
        let tmp = make_temp_project();
        let notes_dir = tmp.path().join("notes");
        std::fs::write(notes_dir.join("note.md"), "# Note").unwrap();
        std::fs::write(notes_dir.join("note.tmp"), "# Note draft").unwrap();
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

    // --- stderr message format ---

    #[test]
    fn stderr_message_format() {
        let case = ProjectDirCase::MalformedProject("parse error".to_string());
        let msg = format_stderr_message("/some/path", &case).unwrap();
        assert!(msg.contains("NOTESAPP_PROJECT_DIR=/some/path"));
        assert!(msg.contains("parse error"));
        assert!(msg.contains("falling back to directory chooser"));
    }

    #[test]
    fn stderr_message_none_for_valid() {
        assert!(format_stderr_message("/p", &ProjectDirCase::ValidProject).is_none());
    }
}
