// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! PDF text extraction for full-text indexing.
//!
//! Uses the `pdf-extract` crate (pure Rust, no native binary required).
//! Errors are converted to `AppError::Search` so callers can log and continue
//! without crashing.

use std::path::Path;

use crate::AppError;

/// Extract all text from a PDF file.
///
/// Returns an empty string for encrypted PDFs or those with no extractable
/// text. Returns `Err(AppError::Search(_))` for files that cannot be parsed
/// at all (corrupted, not a PDF, etc.).
pub fn extract_text(path: &Path) -> Result<String, AppError> {
    pdf_extract::extract_text(path).map_err(|e| {
        AppError::Search(format!(
            "PDF text extraction failed for {}: {}",
            path.display(),
            e
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn extract_text_missing_file_returns_error() {
        let result = extract_text(Path::new("/nonexistent/file.pdf"));
        assert!(result.is_err(), "Missing file should return an error");
    }

    #[test]
    fn extract_text_non_pdf_does_not_panic() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("fake.pdf");
        std::fs::write(&path, b"not a real pdf").unwrap();
        // pdf-extract may return Ok("") or Err(_) for unrecognised content
        // — the key invariant is that it must not panic.
        let _ = extract_text(&path);
    }
}
