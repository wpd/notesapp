// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Search query execution using Tantivy.

use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::Value;
use tantivy::snippet::SnippetGenerator;

use crate::AppError;
use super::SearchIndex;

/// A single search result hit.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchHit {
    /// Absolute path to the matching file.
    pub path: String,
    /// `"note"` or `"reference"`.
    pub kind: String,
    /// Filename stem (used as a display title).
    pub title: String,
    /// Short excerpt around the first match, may contain `<b>...</b>` markup.
    pub snippet: String,
    /// Tantivy relevance score.
    pub score: f32,
}

/// Search the index for `query_str`, returning up to `limit` hits.
///
/// Searches across both the `title` and `body` fields. If `kind_filter` is
/// `Some("note")` or `Some("reference")`, only those document kinds are
/// returned.
pub fn search(
    idx: &SearchIndex,
    query_str: &str,
    limit: usize,
) -> Result<Vec<SearchHit>, AppError> {
    search_filtered(idx, query_str, limit, None)
}

pub fn search_filtered(
    idx: &SearchIndex,
    query_str: &str,
    limit: usize,
    kind_filter: Option<&str>,
) -> Result<Vec<SearchHit>, AppError> {
    let query_str = query_str.trim();
    if query_str.is_empty() {
        return Ok(vec![]);
    }

    let reader = idx
        .index()
        .reader()
        .map_err(|e| AppError::Search(format!("Failed to open reader: {}", e)))?;
    let searcher = reader.searcher();

    let parser = QueryParser::for_index(
        idx.index(),
        vec![idx.field_title(), idx.field_body()],
    );
    let query = parser.parse_query(query_str).map_err(|e| {
        AppError::Search(format!("Failed to parse query '{}': {}", query_str, e))
    })?;

    let top_docs = searcher
        .search(&query, &TopDocs::with_limit(limit * 2)) // over-fetch for kind filter
        .map_err(|e| AppError::Search(format!("Search failed: {}", e)))?;

    let snippet_gen = SnippetGenerator::create(&searcher, &query, idx.field_body())
        .map_err(|e| AppError::Search(format!("SnippetGenerator failed: {}", e)))?;

    let mut hits = Vec::new();
    for (score, doc_addr) in top_docs {
        let doc: tantivy::TantivyDocument = searcher
            .doc(doc_addr)
            .map_err(|e| AppError::Search(format!("Failed to retrieve doc: {}", e)))?;

        let path = text_value(&doc, idx.field_path());
        let kind = text_value(&doc, idx.field_kind());
        let title = text_value(&doc, idx.field_title());

        if let Some(filter) = kind_filter {
            if kind != filter {
                continue;
            }
        }

        let snippet = snippet_gen.snippet_from_doc(&doc).to_html();

        hits.push(SearchHit {
            path,
            kind,
            title,
            snippet,
            score,
        });

        if hits.len() >= limit {
            break;
        }
    }

    Ok(hits)
}

fn text_value(doc: &tantivy::TantivyDocument, field: tantivy::schema::Field) -> String {
    doc.get_first(field)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::index::SearchIndex;
    use tempfile::TempDir;

    fn make_indexed_project(tmp: &TempDir) -> SearchIndex {
        let dir = tmp.path().to_path_buf();
        std::fs::create_dir_all(dir.join(".notesapp")).unwrap();
        std::fs::create_dir_all(dir.join("notes")).unwrap();
        std::fs::create_dir_all(dir.join("references")).unwrap();

        std::fs::write(
            dir.join("notes/alpha.md"),
            "# Alpha\nThis document discusses quantum mechanics.",
        )
        .unwrap();
        std::fs::write(
            dir.join("notes/beta.md"),
            "# Beta\nThis note is about classical physics.",
        )
        .unwrap();
        std::fs::write(
            dir.join("references/paper.md"),
            "# Paper\nA reference about quantum entanglement.",
        )
        .unwrap();

        let mut idx = SearchIndex::open_or_create(&dir).unwrap();
        idx.full_reindex(&dir).unwrap();
        idx
    }

    #[test]
    fn search_returns_relevant_hits() {
        let tmp = TempDir::new().unwrap();
        let idx = make_indexed_project(&tmp);
        let hits = search(&idx, "quantum", 10).unwrap();
        assert!(!hits.is_empty(), "Expected at least one hit for 'quantum'");
        // Both alpha.md (notes) and paper.md (reference) mention quantum
        assert!(hits.len() >= 2);
    }

    #[test]
    fn search_snippets_are_non_empty() {
        let tmp = TempDir::new().unwrap();
        let idx = make_indexed_project(&tmp);
        let hits = search(&idx, "quantum", 10).unwrap();
        for hit in &hits {
            assert!(!hit.snippet.is_empty(), "Snippet should not be empty");
        }
    }

    #[test]
    fn search_kind_filter_notes_only() {
        let tmp = TempDir::new().unwrap();
        let idx = make_indexed_project(&tmp);
        let hits = search_filtered(&idx, "quantum", 10, Some("note")).unwrap();
        assert!(hits.iter().all(|h| h.kind == "note"));
    }

    #[test]
    fn search_kind_filter_references_only() {
        let tmp = TempDir::new().unwrap();
        let idx = make_indexed_project(&tmp);
        let hits = search_filtered(&idx, "quantum", 10, Some("reference")).unwrap();
        assert!(hits.iter().all(|h| h.kind == "reference"));
    }

    #[test]
    fn search_empty_query_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let idx = make_indexed_project(&tmp);
        let hits = search(&idx, "", 10).unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn search_no_match_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let idx = make_indexed_project(&tmp);
        let hits = search(&idx, "xylophoneaardvarkzztop", 10).unwrap();
        assert!(hits.is_empty());
    }
}
