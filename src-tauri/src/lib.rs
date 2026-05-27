use std::sync::Mutex;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
pub struct WindowStatus {
    pub file_path: Option<String>,
    pub is_dirty: bool,
}

#[derive(Default)]
pub struct AppState {
    // Maps window_label -> current open file status
    pub window_statuses: Mutex<HashMap<String, WindowStatus>>,
    // Maps window_label -> pending file path to load on startup
    pub pending_files: Mutex<HashMap<String, String>>,
}

fn is_supported_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt")
}

/// Picks the first arg that looks like a supported file path. Skips argv[0]
/// (the binary itself) and any leading flags Tauri may inject.
#[cfg(desktop)]
fn extract_file_from_args<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter().skip(1).find(|a| is_supported_path(a))
}

fn handle_incoming_file(app: &AppHandle, path: String) {
    let state = app.state::<AppState>();
    let windows = app.webview_windows();

    let should_use_main = if windows.is_empty() {
        false
    } else if windows.len() == 1 && windows.contains_key("main") {
        let has_pending = state.pending_files.lock().unwrap().contains_key("main");
        let status = state.window_statuses.lock().unwrap().get("main").cloned();
        !has_pending && (status.is_none() || (status.as_ref().unwrap().file_path.is_none() && !status.as_ref().unwrap().is_dirty))
    } else {
        false
    };

    if should_use_main {
        if let Ok(mut pending) = state.pending_files.lock() {
            pending.insert("main".to_string(), path.clone());
        }
        let _ = app.emit_to("main", "open-file-pending", ());
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    } else {
        let label = format!("window_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
        if let Ok(mut pending) = state.pending_files.lock() {
            pending.insert(label.clone(), path.clone());
        }

        let app_handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let mut win_builder = tauri::WebviewWindowBuilder::new(
                &app_handle,
                &label,
                tauri::WebviewUrl::App("index.html".into())
            )
            .title("Texodus")
            .inner_size(1280.0, 800.0)
            .min_inner_size(720.0, 480.0)
            .resizable(true)
            .decorations(true);

            #[cfg(target_os = "macos")]
            {
                win_builder = win_builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }

            if let Err(e) = win_builder.build() {
                eprintln!("Failed to build window: {:?}", e);
            }
        });
    }
}

#[tauri::command]
fn take_pending_file(window: tauri::Window, state: tauri::State<'_, AppState>) -> Option<String> {
    if let Ok(mut pending) = state.pending_files.lock() {
        pending.remove(window.label())
    } else {
        None
    }
}

#[tauri::command]
fn report_window_status(window: tauri::Window, path: Option<String>, is_dirty: bool, state: tauri::State<'_, AppState>) {
    if let Ok(mut statuses) = state.window_statuses.lock() {
        statuses.insert(window.label().to_string(), WindowStatus { file_path: path, is_dirty });
    }
}

#[tauri::command]
async fn open_new_window(app: tauri::AppHandle, path: Option<String>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let label = format!("window_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    if let Some(p) = &path {
        if let Ok(mut pending) = state.pending_files.lock() {
            pending.insert(label.clone(), p.clone());
        }
    }

    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        let mut win_builder = tauri::WebviewWindowBuilder::new(
            &app_handle,
            &label,
            tauri::WebviewUrl::App("index.html".into())
        )
        .title("Texodus")
        .inner_size(1280.0, 800.0)
        .min_inner_size(720.0, 480.0)
        .resizable(true)
        .decorations(true);

        #[cfg(target_os = "macos")]
        {
            win_builder = win_builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true);
        }

        if let Err(e) = win_builder.build() {
            eprintln!("Failed to build window: {:?}", e);
        }
    }).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Capture any path from the initial launch's argv (Windows/Linux double-
    // clicks land here). macOS instead delivers files via `RunEvent::Opened`.
    #[cfg(desktop)]
    let initial = extract_file_from_args(std::env::args());
    #[cfg(not(desktop))]
    let initial: Option<String> = None;

    let state = AppState::default();
    if let Some(path) = initial {
        state.pending_files.lock().unwrap().insert("main".to_string(), path);
    }

    let mut builder = tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        // Persists window size/position/maximized state across restarts.
        // Saves on exit, restores automatically when the window is created.
        .plugin(tauri_plugin_window_state::Builder::default().build());

    // Single-instance: when a user double-clicks a .md while Texodus is already
    // running, Windows/Linux spawn a second process; this plugin forwards its
    // argv into the running instance and lets us exit the duplicate cleanly.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(path) = extract_file_from_args(args) {
                handle_incoming_file(app, path);
            } else {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
        }));
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            take_pending_file,
            report_window_status,
            open_new_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } => {
                let state = app_handle.state::<AppState>();
                if let Ok(mut statuses) = state.window_statuses.lock() {
                    statuses.remove(&label);
                };
                if let Ok(mut pending) = state.pending_files.lock() {
                    pending.remove(&label);
                };
            }
            // macOS: Finder/dock "Open With" — and the initial double-click that
            // launched us — both arrive here as file:// URLs.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Some(s) = path.to_str() {
                            handle_incoming_file(app_handle, s.to_string());
                        }
                    }
                }
            }
            _ => {}
        }
    });
}
