// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

pub mod commands;
pub mod error;
pub mod fs;
pub mod search;
pub mod watcher;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(all(unix, not(target_os = "macos")))]
mod linux_spell;

pub use error::AppError;

/// Tauri-managed state for the full-text search index.
///
/// Initialized to `None` at startup; populated by `start_file_watcher` once
/// a project directory is opened. All search commands read from this state.
pub struct SearchState(
    pub std::sync::Arc<std::sync::Mutex<Option<search::SearchIndex>>>,
);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    macos::disable_smart_substitutions();

    tauri::Builder::default()
        .manage(SearchState(std::sync::Arc::new(
            std::sync::Mutex::new(None),
        )))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::project::open_project,
            commands::project::list_notes,
            commands::project::list_notes_all,
            commands::project::classify_project_dir,
            commands::layout::get_project_dir_env,
            commands::layout::save_layout,
            commands::layout::load_layout,
            commands::layout::find_recovery_files,
            commands::notes::read_note,
            commands::notes::write_note,
            commands::notes::autosave_note,
            commands::notes::delete_tmp,
            commands::notes::create_note,
            commands::notes::file_exists,
            commands::watcher::start_file_watcher,
            commands::spellcheck::check_spelling,
            commands::drawings::read_drawing,
            commands::drawings::write_drawing,
            commands::drawings::delete_drawing,
            commands::drawings::autosave_drawing,
            commands::drawings::delete_drawing_tmp,
            commands::drawings::list_drawings,
            commands::drawings::next_drawing_number,
            commands::drawings::drawing_path,
            // Phase 3: Reference tile
            commands::references::list_references,
            commands::references::read_reference,
            commands::references::import_reference,
            commands::references::read_pdf_annotations,
            commands::references::write_pdf_annotations,
            // Phase 3: Full-text search
            commands::search::search_project,
            commands::search::search_notes,
            commands::search::search_references,
            commands::search::reindex_all,
        ])
        .on_page_load(|window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                println!("NOTESAPP_PAGE_LOADED");
                let _ = std::io::Write::flush(&mut std::io::stdout());
                match std::env::var("NOTESAPP_PROJECT_DIR") {
                    Err(_) => {
                        println!("NOTESAPP_PRELOAD: NOTESAPP_PROJECT_DIR not set");
                    }
                    Ok(dir) => {
                        println!("NOTESAPP_PRELOAD: dir={}", dir);
                        let path = std::path::PathBuf::from(&dir);
                        let preload_json = match crate::fs::open_project_for_preload(&path) {
                            Ok(notes) => {
                                println!("NOTESAPP_PRELOAD: {} notes found", notes.len());
                                serde_json::to_string(
                                    &serde_json::json!({ "dir": dir, "notes": notes }),
                                )
                            }
                            Err(e) => {
                                let reason = e.to_string();
                                println!("NOTESAPP_PRELOAD: error: {}", reason);
                                serde_json::to_string(
                                    &serde_json::json!({ "dir": null, "error": reason }),
                                )
                            }
                        };
                        match preload_json {
                            Err(e) => println!("NOTESAPP_PRELOAD: json error: {}", e),
                            Ok(json) => {
                                let script = format!(
                                    "window.__NOTESAPP_PRELOADED__={};document.body&&document.body.setAttribute('data-notesapp-preloaded','1');",
                                    json
                                );
                                match window.eval(&script) {
                                    Ok(_) => println!("NOTESAPP_PRELOAD: eval OK"),
                                    Err(e) => println!("NOTESAPP_PRELOAD: eval ERR: {:?}", e),
                                }
                            }
                        }
                    }
                }
                let _ = std::io::Write::flush(&mut std::io::stdout());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NotesApp");
}
