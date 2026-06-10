use std::collections::{BTreeSet, HashMap};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
pub struct WindowStatus {
    pub file_path: Option<String>,
    pub is_dirty: bool,
}

// Mirrors the frontend `DocumentMode` (`'windows' | 'tabs'`). A global app
// preference (it lives in shared localStorage), reported by any window so the
// Rust side can decide whether an incoming file becomes a new window or a tab.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum DocumentMode {
    Windows,
    Tabs,
}

impl Default for DocumentMode {
    fn default() -> Self {
        DocumentMode::Windows
    }
}

#[derive(Default)]
pub struct AppState {
    // Maps window_label -> current open file status
    pub window_statuses: Mutex<HashMap<String, WindowStatus>>,
    // Maps window_label -> pending file path to load on startup
    pub pending_files: Mutex<HashMap<String, String>>,
    // Latest documentMode reported by the frontend (shared across windows).
    pub document_mode: Mutex<DocumentMode>,
}

// Monotonic per-process counter for window labels. Replaces the previous
// `SystemTime::now().as_millis()` scheme, which could collide when two
// "Open With" invocations land in the same millisecond.
static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_window_label() -> String {
    let n = WINDOW_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("window_{}", n)
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

/// Spawns a new Texodus window with the project's standard chrome.
/// Caller is responsible for seeding `AppState.pending_files` beforehand
/// if the new window should auto-load a file.
fn build_window(app: &AppHandle, label: &str) {
    let label = label.to_string();
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let mut win_builder = tauri::WebviewWindowBuilder::new(
            &app_handle,
            &label,
            tauri::WebviewUrl::App("index.html".into()),
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

/// Returns true iff the main window is (or will be) empty and should receive
/// the incoming file rather than have a new window spawned for it.
fn main_window_is_empty(app: &AppHandle, state: &AppState) -> bool {
    let windows = app.webview_windows();

    // Cold-start race on macOS: Cocoa's `applicationOpenURLs` fires (and
    // Tauri emits `RunEvent::Opened`) BEFORE the main window from
    // `tauri.conf.json` has been built. Without this branch we'd treat the
    // missing window as "not empty" and spawn a redundant window_0 — main
    // would then appear from the config a moment later, empty.
    //
    // Main is guaranteed to be created by Tauri at startup, so it's safe to
    // queue `pending["main"]` here; the frontend drains it on mount.
    if windows.is_empty() {
        // Unless main already has a *different* pending file (e.g. Windows
        // seeded one from argv, or multiple Finder URLs arrived in this
        // launch), in which case let the caller spawn a separate window so
        // both files end up open.
        let main_has_other_pending = state
            .pending_files
            .lock()
            .map(|p| p.contains_key("main"))
            .unwrap_or(false);
        return !main_has_other_pending;
    }

    if windows.len() != 1 || !windows.contains_key("main") {
        return false;
    }
    let has_pending = state
        .pending_files
        .lock()
        .map(|p| p.contains_key("main"))
        .unwrap_or(true);
    if has_pending {
        return false;
    }
    let status = state
        .window_statuses
        .lock()
        .ok()
        .and_then(|s| s.get("main").cloned());
    match status {
        None => true,
        Some(s) => s.file_path.is_none() && !s.is_dirty,
    }
}

/// In tabs mode an incoming file should land in an *existing* window as a new
/// tab. Picks the focused window, falling back to `main`, then any window.
/// Returns `None` when no window exists yet (cold start).
fn target_window_label(app: &AppHandle) -> Option<String> {
    let windows = app.webview_windows();
    if windows.is_empty() {
        return None;
    }
    for (label, win) in &windows {
        if win.is_focused().unwrap_or(false) {
            return Some(label.clone());
        }
    }
    if windows.contains_key("main") {
        return Some("main".to_string());
    }
    windows.keys().next().cloned()
}

fn handle_incoming_file(app: &AppHandle, path: String) {
    let state = app.state::<AppState>();

    // Idempotency: this exact path is already queued for some window (most
    // commonly: argv seeded `pending["main"]` at startup and now the single-
    // instance plugin is firing the callback for the same launch). Skip
    // spawning a duplicate — the existing handler will load the file when
    // its frontend mounts.
    let already_handled = state
        .pending_files
        .lock()
        .map(|p| p.values().any(|v| v == &path))
        .unwrap_or(false);
    if already_handled {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
        return;
    }

    // Tabs mode: route the file into an existing window so the frontend opens
    // it as a new tab (via `requestOpenFromPath`) instead of a new window. On
    // cold start (no window yet) `target_window_label` returns `None` and we
    // fall through to the empty-main / new-window logic below.
    let tabs_mode = state
        .document_mode
        .lock()
        .map(|m| *m == DocumentMode::Tabs)
        .unwrap_or(false);
    if tabs_mode {
        if let Some(label) = target_window_label(app) {
            if let Ok(mut pending) = state.pending_files.lock() {
                pending.insert(label.clone(), path);
            }
            let _ = app.emit_to(&label, "open-file-pending", ());
            if let Some(win) = app.get_webview_window(&label) {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            return;
        }
    }

    if main_window_is_empty(app, &state) {
        if let Ok(mut pending) = state.pending_files.lock() {
            pending.insert("main".to_string(), path);
        }
        let _ = app.emit_to("main", "open-file-pending", ());
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    } else {
        let label = next_window_label();
        if let Ok(mut pending) = state.pending_files.lock() {
            pending.insert(label.clone(), path);
        }
        build_window(app, &label);
    }
}

#[tauri::command]
fn take_pending_file(window: tauri::Window, state: tauri::State<'_, AppState>) -> Option<String> {
    state
        .pending_files
        .lock()
        .ok()
        .and_then(|mut p| p.remove(window.label()))
}

#[tauri::command]
fn report_window_status(
    window: tauri::Window,
    path: Option<String>,
    is_dirty: bool,
    document_mode: Option<String>,
    state: tauri::State<'_, AppState>,
) {
    if let Ok(mut statuses) = state.window_statuses.lock() {
        statuses.insert(
            window.label().to_string(),
            WindowStatus { file_path: path, is_dirty },
        );
    }
    if let Some(mode) = document_mode {
        if let Ok(mut current) = state.document_mode.lock() {
            *current = match mode.as_str() {
                "tabs" => DocumentMode::Tabs,
                _ => DocumentMode::Windows,
            };
        }
    }
}

#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();

    let mut names = BTreeSet::new();
    for face in db.faces() {
        for (family, _) in &face.families {
            let trimmed = family.trim();
            if !trimmed.is_empty() {
                names.insert(trimmed.to_string());
            }
        }
    }

    names.into_iter().collect()
}

#[tauri::command]
async fn open_new_window(
    app: tauri::AppHandle,
    path: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let label = next_window_label();
    if let Some(p) = path {
        if let Ok(mut pending) = state.pending_files.lock() {
            pending.insert(label.clone(), p);
        }
    }
    build_window(&app, &label);
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
        // Init-time, no other threads yet — unwrap is sound.
        state
            .pending_files
            .lock()
            .unwrap()
            .insert("main".to_string(), path);
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
            } else if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }));
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            take_pending_file,
            report_window_status,
            list_system_fonts,
            open_new_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } => {
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
    });
}
