// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

pub mod commands;
pub mod error;
pub mod fs;

pub use error::AppError;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::layout::get_project_dir_env,
            commands::layout::save_layout,
            commands::layout::load_layout,
            commands::layout::find_recovery_files,
            commands::notes::read_note,
            commands::notes::write_note,
            commands::notes::autosave_note,
            commands::notes::delete_tmp,
            commands::notes::create_note,
        ])
        // Print a well-known marker once the webview page has finished loading.
        // The E2E test harness (wdio.conf.ts) monitors the process stdout for
        // this marker so it knows the tauri:// URL is live before starting
        // WebKitWebDriver — connecting too early (while still at about:blank)
        // permanently binds the WebDriver session to the blank page.
        .on_page_load(|window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                println!("NOTESAPP_PAGE_LOADED");
                let _ = std::io::Write::flush(&mut std::io::stdout());
                // If NOTESAPP_PROJECT_DIR is set (automation / dev), pre-load the
                // project data into a well-known JS global so the frontend can
                // bootstrap without going through the async IPC path (which may
                // hang under WebKit automation after the DOM reset).
                match std::env::var("NOTESAPP_PROJECT_DIR") {
                    Err(_) => {
                        println!("NOTESAPP_PRELOAD: NOTESAPP_PROJECT_DIR not set");
                    }
                    Ok(dir) => {
                        println!("NOTESAPP_PRELOAD: dir={}", dir);
                        let path = std::path::PathBuf::from(&dir);
                        let _ = crate::fs::init_project_dir(&path);
                        match crate::fs::list_notes(&path) {
                            Err(e) => println!("NOTESAPP_PRELOAD: list_notes error: {}", e),
                            Ok(notes) => {
                                println!("NOTESAPP_PRELOAD: {} notes found", notes.len());
                                match serde_json::to_string(
                                    &serde_json::json!({ "dir": dir, "notes": notes }),
                                ) {
                                    Err(e) => println!("NOTESAPP_PRELOAD: json error: {}", e),
                                    Ok(json) => {
                                        // Set the preloaded data AND a DOM
                                        // attribute signal on document.body.
                                        // The attribute mutation is observed
                                        // by main.tsx's MutationObserver to
                                        // trigger the re-render without timers
                                        // (timers may be throttled in WebKit
                                        // automation mode).
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
                    }
                }
                let _ = std::io::Write::flush(&mut std::io::stdout());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NotesApp");
}
