// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

//! Full-text search backed by Tantivy (SPEC.md §2.3, §5.4, §7.2).
//!
//! The index lives at `<project-dir>/.notesapp/search-index/` and is built
//! lazily on first project open, then updated incrementally via the file
//! watcher. This module is internal; commands are exposed via
//! `commands::search`.

pub mod index;
pub mod pdf;
pub mod query;

pub use index::SearchIndex;
pub use query::SearchHit;
