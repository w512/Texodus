use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

/// Slot for a file path that arrived before the frontend was ready to listen.
/// The frontend drains this on mount via the `take_pending_file` command, then
/// listens for `open-file-pending` for any subsequent arrivals.
struct PendingFile(Mutex<Option<String>>);

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

/// Stores `path` in the pending slot (overwriting any previous one — the most
/// recent open request wins) and wakes the frontend. The frontend always
/// consumes via `take_pending_file`, so the event payload itself is unused.
fn deliver_path(app: &AppHandle, path: String) {
    if let Some(state) = app.try_state::<PendingFile>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = Some(path);
        }
    }
    let _ = app.emit("open-file-pending", ());
}

#[tauri::command]
fn take_pending_file(state: tauri::State<'_, PendingFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Capture any path from the initial launch's argv (Windows/Linux double-
    // clicks land here). macOS instead delivers files via `RunEvent::Opened`.
    #[cfg(desktop)]
    let initial = extract_file_from_args(std::env::args());
    #[cfg(not(desktop))]
    let initial: Option<String> = None;

    let mut builder = tauri::Builder::default()
        .manage(PendingFile(Mutex::new(initial)))
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
                deliver_path(app, path);
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }));
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![take_pending_file])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // macOS: Finder/dock "Open With" — and the initial double-click that
        // launched us — both arrive here as file:// URLs.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    if let Some(s) = path.to_str() {
                        deliver_path(app_handle, s.to_string());
                    }
                }
            }
        }
        let _ = (app_handle, event);
    });
}
