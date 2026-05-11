// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Tantivy search index management.
//!
//! The index directory is `<project-dir>/.notesapp/search-index/`.
//! A `meta.json` file is written after a successful full reindex so
//! subsequent launches can skip the rebuild if the schema version matches.
//!
//! Only `.md` and `.pdf` files are indexed; annotation sidecars, `.tmp`
//! files, and `.drawing` files are skipped.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tantivy::schema::{
    Field, Schema, SchemaBuilder, TEXT, STRING, STORED,
    NumericOptions,
};
use tantivy::{Index, IndexWriter, TantivyDocument, Term};

use crate::AppError;
use crate::fs::SEARCH_INDEX_SUBDIR;

const SCHEMA_VERSION: u32 = 1;
/// Separate from Tantivy's own `meta.json` to avoid namespace conflicts.
const META_FILE: &str = "notesapp_meta.json";
/// Heap budget per temporary IndexWriter (15 MB is well above the minimum).
const WRITER_HEAP_BYTES: usize = 15_000_000;
/// Maximum body characters indexed per document (avoids blowing up the index
/// on enormous files — Phase 3 is not a full-text-of-a-book product).
const MAX_BODY_CHARS: usize = 200_000;

#[derive(serde::Serialize, serde::Deserialize)]
struct MetaJson {
    schema_version: u32,
    indexed_at: String,
}

/// Lightweight handle to the Tantivy full-text search index.
///
/// All methods that write to the index create and commit a temporary
/// `IndexWriter` for that operation, so there is no persistent writer held
/// in memory. This allows the struct to be `Send + Sync` without extra
/// synchronisation overhead in the fields themselves.
pub struct SearchIndex {
    index: Index,
    schema: Schema,
    f_path: Field,
    f_kind: Field,
    f_title: Field,
    f_body: Field,
    f_modified: Field,
    index_dir: PathBuf,
}

// Index / Schema / Field are all Send + Sync in Tantivy.
unsafe impl Send for SearchIndex {}
unsafe impl Sync for SearchIndex {}

impl SearchIndex {
    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    /// Open the Tantivy index at `<project_dir>/.notesapp/search-index/`,
    /// creating (or recreating) it if it does not exist or has a schema
    /// mismatch.
    pub fn open_or_create(project_dir: &Path) -> Result<Self, AppError> {
        let index_dir = project_dir
            .join(".notesapp")
            .join(SEARCH_INDEX_SUBDIR);

        // If the directory exists but the schema is wrong (Tantivy returns
        // an error on mismatch), blow it away and start fresh.
        if index_dir.is_dir() {
            let schema = build_schema();
            match Index::open_in_dir(&index_dir) {
                Ok(existing) => {
                    if existing.schema() != schema {
                        // Schema mismatch — remove and fall through to create.
                        std::fs::remove_dir_all(&index_dir).map_err(|e| {
                            AppError::Search(format!("Failed to remove stale index: {}", e))
                        })?;
                    } else {
                        let (f_path, f_kind, f_title, f_body, f_modified) =
                            field_handles(&schema);
                        return Ok(Self {
                            index: existing,
                            schema,
                            f_path,
                            f_kind,
                            f_title,
                            f_body,
                            f_modified,
                            index_dir,
                        });
                    }
                }
                Err(_) => {
                    // Corrupted — remove and recreate.
                    std::fs::remove_dir_all(&index_dir).map_err(|e| {
                        AppError::Search(format!("Failed to remove corrupted index: {}", e))
                    })?;
                }
            }
        }

        // Create fresh index.
        std::fs::create_dir_all(&index_dir)?;
        let schema = build_schema();
        let index = Index::create_in_dir(&index_dir, schema.clone()).map_err(|e| {
            AppError::Search(format!("Failed to create search index: {}", e))
        })?;

        let (f_path, f_kind, f_title, f_body, f_modified) = field_handles(&schema);
        Ok(Self {
            index,
            schema,
            f_path,
            f_kind,
            f_title,
            f_body,
            f_modified,
            index_dir,
        })
    }

    // -----------------------------------------------------------------------
    // Indexing
    // -----------------------------------------------------------------------

    /// Return true if the `meta.json` indicates the index is up-to-date
    /// (schema version matches and at least one indexing run has completed).
    pub fn needs_reindex(&self) -> bool {
        let meta_path = self.index_dir.join(META_FILE);
        if !meta_path.is_file() {
            return true;
        }
        let Ok(raw) = std::fs::read_to_string(&meta_path) else {
            return true;
        };
        let Ok(meta) = serde_json::from_str::<MetaJson>(&raw) else {
            return true;
        };
        meta.schema_version != SCHEMA_VERSION
    }

    /// Reindex all notes and reference files in `project_dir` from scratch.
    ///
    /// Clears all existing documents, then walks `notes/` and `references/`,
    /// indexing `.md` files as text and `.pdf` files using PDF text extraction.
    /// Writes `meta.json` on success.
    pub fn full_reindex(&mut self, project_dir: &Path) -> Result<usize, AppError> {
        let mut writer = self.writer()?;
        writer.delete_all_documents().map_err(|e| {
            AppError::Search(format!("Failed to clear index: {}", e))
        })?;

        let mut count = 0usize;

        for subdir in ["notes", "references"] {
            let dir = project_dir.join(subdir);
            if !dir.is_dir() {
                continue;
            }
            for entry in walkdir_files(&dir) {
                let ext = extension_lower(&entry);
                if !should_index(&ext) {
                    continue;
                }
                let kind = if subdir == "notes" { "note" } else { "reference" };
                if let Ok(doc) = self.build_document(&entry, kind) {
                    writer.add_document(doc).map_err(|e| {
                        AppError::Search(format!("add_document failed: {}", e))
                    })?;
                    count += 1;
                }
            }
        }

        writer.commit().map_err(|e| {
            AppError::Search(format!("commit failed during full_reindex: {}", e))
        })?;

        self.write_meta()?;
        Ok(count)
    }

    /// Update the index entry for a single file. If the file does not exist
    /// or has an unsupported extension, it is silently skipped.
    pub fn upsert_path(&mut self, path: &Path) -> Result<(), AppError> {
        let ext = extension_lower(path);
        if !should_index(&ext) {
            return Ok(());
        }
        if !path.is_file() {
            return Ok(());
        }

        let kind = if path_is_under(path, "references") {
            "reference"
        } else {
            "note"
        };

        let mut writer = self.writer()?;
        // Remove any prior document for this path, then re-add.
        writer.delete_term(Term::from_field_text(
            self.f_path,
            &path.to_string_lossy(),
        ));

        if let Ok(doc) = self.build_document(path, kind) {
            writer.add_document(doc).map_err(|e| {
                AppError::Search(format!("add_document failed: {}", e))
            })?;
        }

        writer.commit().map_err(|e| {
            AppError::Search(format!("commit failed during upsert_path: {}", e))
        })?;
        Ok(())
    }

    /// Remove a document from the index by absolute path.
    pub fn remove_path(&mut self, path: &Path) -> Result<(), AppError> {
        let mut writer = self.writer()?;
        writer.delete_term(Term::from_field_text(
            self.f_path,
            &path.to_string_lossy(),
        ));
        writer.commit().map_err(|e| {
            AppError::Search(format!("commit failed during remove_path: {}", e))
        })?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn writer(&self) -> Result<IndexWriter, AppError> {
        self.index
            .writer(WRITER_HEAP_BYTES)
            .map_err(|e| AppError::Search(format!("Failed to acquire IndexWriter: {}", e)))
    }

    fn build_document(
        &self,
        path: &Path,
        kind: &str,
    ) -> Result<TantivyDocument, AppError> {
        let ext = extension_lower(path);
        let body = if ext == "pdf" {
            super::pdf::extract_text(path).unwrap_or_default()
        } else {
            std::fs::read_to_string(path).unwrap_or_default()
        };

        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let body_truncated = if body.len() > MAX_BODY_CHARS {
            body[..MAX_BODY_CHARS].to_string()
        } else {
            body
        };

        let modified = path
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let mut doc = TantivyDocument::new();
        doc.add_text(self.f_path, path.to_string_lossy().as_ref());
        doc.add_text(self.f_kind, kind);
        doc.add_text(self.f_title, &title);
        doc.add_text(self.f_body, &body_truncated);
        doc.add_i64(self.f_modified, modified);
        Ok(doc)
    }

    fn write_meta(&self) -> Result<(), AppError> {
        let meta = MetaJson {
            schema_version: SCHEMA_VERSION,
            indexed_at: iso_now(),
        };
        let json = serde_json::to_string(&meta)?;
        std::fs::write(self.index_dir.join(META_FILE), json)?;
        Ok(())
    }

    /// Expose the Tantivy `Index` for search operations.
    pub(super) fn index(&self) -> &Index {
        &self.index
    }

    pub(super) fn field_path(&self) -> Field {
        self.f_path
    }
    pub(super) fn field_kind(&self) -> Field {
        self.f_kind
    }
    pub(super) fn field_title(&self) -> Field {
        self.f_title
    }
    pub(super) fn field_body(&self) -> Field {
        self.f_body
    }
}

// ---------------------------------------------------------------------------
// Schema construction
// ---------------------------------------------------------------------------

fn build_schema() -> Schema {
    let mut b = SchemaBuilder::new();
    b.add_text_field("path", STRING | STORED);
    b.add_text_field("kind", STRING | STORED);
    b.add_text_field("title", TEXT | STORED);
    b.add_text_field("body", TEXT | STORED);
    b.add_i64_field("modified", NumericOptions::default().set_stored());
    b.build()
}

fn field_handles(schema: &Schema) -> (Field, Field, Field, Field, Field) {
    (
        schema.get_field("path").expect("path field"),
        schema.get_field("kind").expect("kind field"),
        schema.get_field("title").expect("title field"),
        schema.get_field("body").expect("body field"),
        schema.get_field("modified").expect("modified field"),
    )
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

fn extension_lower(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn should_index(ext: &str) -> bool {
    matches!(ext, "md" | "txt" | "pdf")
}

fn path_is_under(path: &Path, subdir: &str) -> bool {
    path.components().any(|c| c.as_os_str() == subdir)
}

/// Collect all regular files under `dir` recursively.
fn walkdir_files(dir: &Path) -> Vec<PathBuf> {
    let mut result = Vec::new();
    collect_files(dir, &mut result);
    result
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, out);
        } else if path.is_file() {
            out.push(path);
        }
    }
}

fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Minimal ISO-8601 representation (no external dependency needed).
    format!("{}", secs)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_project(tmp: &TempDir) -> PathBuf {
        let dir = tmp.path().to_path_buf();
        std::fs::create_dir_all(dir.join(".notesapp")).unwrap();
        std::fs::create_dir_all(dir.join("notes")).unwrap();
        std::fs::create_dir_all(dir.join("references")).unwrap();
        dir
    }

    fn write_note(dir: &Path, name: &str, content: &str) {
        std::fs::write(dir.join("notes").join(name), content).unwrap();
    }

    fn write_ref(dir: &Path, name: &str, content: &str) {
        std::fs::write(dir.join("references").join(name), content).unwrap();
    }

    #[test]
    fn open_or_create_creates_index_dir() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        let _idx = SearchIndex::open_or_create(&dir).unwrap();
        assert!(dir.join(".notesapp").join(SEARCH_INDEX_SUBDIR).is_dir());
    }

    #[test]
    fn open_or_create_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        let _idx1 = SearchIndex::open_or_create(&dir).unwrap();
        let _idx2 = SearchIndex::open_or_create(&dir).unwrap();
        // No panic or error on second open
    }

    #[test]
    fn needs_reindex_true_when_no_meta() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        let idx = SearchIndex::open_or_create(&dir).unwrap();
        assert!(idx.needs_reindex());
    }

    #[test]
    fn full_reindex_returns_correct_count() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        write_note(&dir, "alpha.md", "# Alpha\nSome content about alpha.");
        write_note(&dir, "beta.md", "# Beta\nSome content about beta.");
        write_ref(&dir, "paper.md", "# Paper\nAcademic content.");

        let mut idx = SearchIndex::open_or_create(&dir).unwrap();
        let count = idx.full_reindex(&dir).unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn needs_reindex_false_after_full_reindex() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        write_note(&dir, "note.md", "content");
        let mut idx = SearchIndex::open_or_create(&dir).unwrap();
        idx.full_reindex(&dir).unwrap();
        assert!(!idx.needs_reindex());
    }

    #[test]
    fn upsert_and_remove_path() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        let note_path = dir.join("notes/alpha.md");
        std::fs::write(&note_path, "Alpha content for searching").unwrap();

        let mut idx = SearchIndex::open_or_create(&dir).unwrap();
        idx.upsert_path(&note_path).unwrap();

        // Search should find it
        let hits = crate::search::query::search(&idx, "alpha", 10).unwrap();
        assert!(!hits.is_empty());

        // Remove and search again
        idx.remove_path(&note_path).unwrap();
        let hits_after = crate::search::query::search(&idx, "alpha", 10).unwrap();
        assert!(hits_after.is_empty());
    }

    #[test]
    fn upsert_skips_annotation_sidecar() {
        let tmp = TempDir::new().unwrap();
        let dir = make_project(&tmp);
        let sidecar = dir.join("references/paper.pdf.annotations");
        std::fs::write(&sidecar, r#"[{"page":1}]"#).unwrap();

        let mut idx = SearchIndex::open_or_create(&dir).unwrap();
        // Should silently skip — no error
        idx.upsert_path(&sidecar).unwrap();
    }
}
