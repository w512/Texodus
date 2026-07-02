use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone)]
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
    // Maps window_label -> queue of pending file paths to load. A queue (not
    // a single slot) because several "Open With" files can target the same
    // window (tabs mode, multi-select in Finder) before the frontend drains.
    pub pending_files: Mutex<HashMap<String, Vec<String>>>,
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

/// Collects every arg that looks like a supported file path (multi-select
/// "Open With" passes several). Skips argv[0] (the binary itself) and any
/// flags Tauri may inject.
#[cfg(desktop)]
fn extract_files_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| is_supported_path(a))
        .collect()
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
            eprintln!("Failed to build window {:?}: {}", label, e);
            // Clean up pending files so they don't hang forever waiting
            // for a window that will never mount and drain the queue.
            if let Some(state) = app_handle.try_state::<AppState>() {
                if let Ok(mut pending) = state.pending_files.lock() {
                    pending.remove(&label);
                }
            }
        }
    });
}

/// Returns true iff the main window is (or will be) empty and should receive
/// the incoming file rather than have a new window spawned for it.
fn main_window_is_empty(app: &AppHandle, state: &AppState) -> bool {
    let window_labels: Vec<String> = app.webview_windows().keys().cloned().collect();
    let pending = state.pending_files.lock().unwrap();
    let statuses = state.window_statuses.lock().unwrap();
    is_main_window_empty(&window_labels, &pending, &statuses)
}

/// Pure logic extracted from `main_window_is_empty` for testability.
///
/// `window_labels` is the list of currently open webview window labels.
/// `pending` and `statuses` are snapshots of the app state at call time.
fn is_main_window_empty(
    window_labels: &[String],
    pending: &HashMap<String, Vec<String>>,
    statuses: &HashMap<String, WindowStatus>,
) -> bool {
    // Cold-start race on macOS: Cocoa's `applicationOpenURLs` fires (and
    // Tauri emits `RunEvent::Opened`) BEFORE the main window from
    // `tauri.conf.json` has been built. Without this branch we'd treat the
    // missing window as "not empty" and spawn a redundant window_0 — main
    // would then appear from the config a moment later, empty.
    //
    // Main is guaranteed to be created by Tauri at startup, so it's safe to
    // queue `pending["main"]` here; the frontend drains it on mount.
    if window_labels.is_empty() {
        // Unless main already has a *different* pending file (e.g. Windows
        // seeded one from argv, or multiple Finder URLs arrived in this
        // launch), in which case let the caller spawn a separate window so
        // both files end up open.
        let main_has_other_pending = pending
            .get("main")
            .is_some_and(|q| !q.is_empty());
        return !main_has_other_pending;
    }

    if window_labels.len() != 1 || !window_labels.iter().any(|l| l == "main") {
        return false;
    }
    let has_pending = pending
        .get("main")
        .is_some_and(|q| !q.is_empty());
    if has_pending {
        return false;
    }
    match statuses.get("main") {
        None => true,
        Some(s) => s.file_path.is_none() && !s.is_dirty,
    }
}

/// In tabs mode an incoming file should land in an *existing* window as a new
/// tab. Picks the focused window, falling back to `main`, then any window.
/// Returns `None` when no window exists yet (cold start).
fn target_window_label(app: &AppHandle) -> Option<String> {
    let windows: Vec<(String, bool)> = app
        .webview_windows()
        .iter()
        .map(|(label, win)| (label.clone(), win.is_focused().unwrap_or(false)))
        .collect();
    pick_target_window_label(&windows)
}

/// Pure logic extracted from `target_window_label` for testability.
///
/// `windows` is a list of (label, is_focused) pairs for all open webview
/// windows. Returns the label of the window that should receive a new tab,
/// or `None` if no windows exist.
fn pick_target_window_label(windows: &[(String, bool)]) -> Option<String> {
    if windows.is_empty() {
        return None;
    }
    // Prefer the focused window.
    for (label, is_focused) in windows {
        if *is_focused {
            return Some(label.clone());
        }
    }
    // Fall back to "main" if it exists.
    if let Some((label, _)) = windows.iter().find(|(l, _)| l == "main") {
        return Some(label.clone());
    }
    // Last resort: the first window.
    windows.first().map(|(l, _)| l.clone())
}

/// Pure helper: checks whether `path` is already queued in any window's
/// pending-files list. Used for idempotency in `handle_incoming_file`.
fn is_path_already_pending(path: &str, pending: &HashMap<String, Vec<String>>) -> bool {
    pending.values().any(|q| q.contains(&path.to_string()))
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
        .map(|p| is_path_already_pending(&path, &p))
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
                pending.entry(label.clone()).or_default().push(path);
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
            pending.entry("main".to_string()).or_default().push(path);
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
            pending.insert(label.clone(), vec![path]);
        }
        build_window(app, &label);
    }
}

#[tauri::command]
fn take_pending_files(window: tauri::Window, state: tauri::State<'_, AppState>) -> Vec<String> {
    state
        .pending_files
        .lock()
        .ok()
        .and_then(|mut p| p.remove(window.label()))
        .unwrap_or_default()
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
fn allow_asset_directory(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(PathBuf::from(path), true)
        .map_err(|e| e.to_string())
}

/// Cached system font list. `fontdb::Database::load_system_fonts()` is
/// expensive (iterates all system font files); the result doesn't change
/// during the app's lifetime, so we compute it once and reuse.
static FONTS_CACHE: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();

#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    FONTS_CACHE
        .get_or_init(|| {
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
        })
        .clone()
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
            pending.insert(label.clone(), vec![p]);
        }
    }
    build_window(&app, &label);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Capture any paths from the initial launch's argv (Windows/Linux double-
    // clicks land here). macOS instead delivers files via `RunEvent::Opened`.
    #[cfg(desktop)]
    let initial = extract_files_from_args(std::env::args());
    #[cfg(not(desktop))]
    let initial: Vec<String> = Vec::new();

    let state = AppState::default();
    if !initial.is_empty() {
        // Init-time, no other threads yet — unwrap is sound. All paths queue
        // for `main`; the frontend drains them one by one (tabs mode keeps
        // them as tabs, windows mode forwards the extras to new windows).
        state
            .pending_files
            .lock()
            .unwrap()
            .insert("main".to_string(), initial);
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
            let paths = extract_files_from_args(args);
            if paths.is_empty() {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            } else {
                for path in paths {
                    handle_incoming_file(app, path);
                }
            }
        }));
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            report_window_status,
            allow_asset_directory,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_paths_match_markdown_extensions_case_insensitively() {
        assert!(is_supported_path("/tmp/notes.md"));
        assert!(is_supported_path("/tmp/notes.MD"));
        assert!(is_supported_path("C:\\Docs\\Read Me.Markdown"));
        assert!(is_supported_path("/tmp/log.txt"));

        assert!(!is_supported_path("/tmp/main.rs"));
        assert!(!is_supported_path("/tmp/md")); // ".md" must be a suffix with the dot
        assert!(!is_supported_path("/tmp/notes.md.bak"));
        assert!(!is_supported_path(""));
    }

    #[cfg(desktop)]
    #[test]
    fn extract_files_picks_every_supported_arg_after_argv0() {
        let args = vec![
            "/Applications/Texodus.app/Contents/MacOS/texodus".to_string(),
            "--some-flag".to_string(),
            "/tmp/a.md".to_string(),
            "/tmp/b.md".to_string(),
        ];
        assert_eq!(
            extract_files_from_args(args),
            vec!["/tmp/a.md".to_string(), "/tmp/b.md".to_string()]
        );
    }

    #[cfg(desktop)]
    #[test]
    fn extract_files_skips_argv0_even_when_it_looks_supported() {
        let args = vec!["./texodus.md".to_string()];
        assert!(extract_files_from_args(args).is_empty());
    }

    #[cfg(desktop)]
    #[test]
    fn extract_files_returns_empty_without_a_supported_path() {
        let args = vec!["texodus".to_string(), "--verbose".to_string()];
        assert!(extract_files_from_args(args).is_empty());
    }

    // ── is_main_window_empty ─────────────────────────────────────────────

    fn empty_status() -> WindowStatus {
        WindowStatus { file_path: None, is_dirty: false }
    }

    fn dirty_status() -> WindowStatus {
        WindowStatus { file_path: Some("/tmp/x.md".to_string()), is_dirty: true }
    }

    #[test]
    fn main_window_empty_when_no_windows_and_no_pending() {
        let pending = HashMap::new();
        let statuses = HashMap::new();
        assert!(is_main_window_empty(&[], &pending, &statuses));
    }

    #[test]
    fn main_window_not_empty_when_no_windows_but_main_has_pending() {
        let mut pending = HashMap::new();
        pending.insert("main".to_string(), vec!["/tmp/a.md".to_string()]);
        let statuses = HashMap::new();
        assert!(!is_main_window_empty(&[], &pending, &statuses));
    }

    #[test]
    fn main_window_empty_with_single_main_no_pending_no_status() {
        let pending = HashMap::new();
        let statuses = HashMap::new();
        assert!(is_main_window_empty(&["main".to_string()], &pending, &statuses));
    }

    #[test]
    fn main_window_empty_with_single_main_no_pending_empty_status() {
        let pending = HashMap::new();
        let mut statuses = HashMap::new();
        statuses.insert("main".to_string(), empty_status());
        assert!(is_main_window_empty(&["main".to_string()], &pending, &statuses));
    }

    #[test]
    fn main_window_not_empty_with_dirty_main() {
        let pending = HashMap::new();
        let mut statuses = HashMap::new();
        statuses.insert("main".to_string(), dirty_status());
        assert!(!is_main_window_empty(&["main".to_string()], &pending, &statuses));
    }

    #[test]
    fn main_window_not_empty_with_pending_file() {
        let mut pending = HashMap::new();
        pending.insert("main".to_string(), vec!["/tmp/a.md".to_string()]);
        let statuses = HashMap::new();
        assert!(!is_main_window_empty(&["main".to_string()], &pending, &statuses));
    }

    #[test]
    fn main_window_not_empty_with_multiple_windows() {
        let pending = HashMap::new();
        let statuses = HashMap::new();
        assert!(!is_main_window_empty(&["main".to_string(), "window_0".to_string()], &pending, &statuses));
    }

    #[test]
    fn main_window_not_empty_with_only_non_main_window() {
        let pending = HashMap::new();
        let statuses = HashMap::new();
        assert!(!is_main_window_empty(&["window_0".to_string()], &pending, &statuses));
    }

    #[test]
    fn main_window_not_empty_with_file_loaded_but_not_dirty() {
        let pending = HashMap::new();
        let mut statuses = HashMap::new();
        statuses.insert("main".to_string(), WindowStatus {
            file_path: Some("/tmp/loaded.md".to_string()),
            is_dirty: false,
        });
        assert!(!is_main_window_empty(&["main".to_string()], &pending, &statuses));
    }

    // ── pick_target_window_label ────────────────────────────────────────

    #[test]
    fn target_window_none_when_no_windows() {
        assert_eq!(pick_target_window_label(&[]), None);
    }

    #[test]
    fn target_window_prefers_focused() {
        let windows = vec![
            ("main".to_string(), false),
            ("window_0".to_string(), true),
        ];
        assert_eq!(pick_target_window_label(&windows), Some("window_0".to_string()));
    }

    #[test]
    fn target_window_falls_back_to_main() {
        let windows = vec![
            ("window_0".to_string(), false),
            ("main".to_string(), false),
        ];
        assert_eq!(pick_target_window_label(&windows), Some("main".to_string()));
    }

    #[test]
    fn target_window_falls_back_to_first_when_no_main_no_focus() {
        let windows = vec![
            ("window_0".to_string(), false),
            ("window_1".to_string(), false),
        ];
        assert_eq!(pick_target_window_label(&windows), Some("window_0".to_string()));
    }

    #[test]
    fn target_window_main_takes_priority_over_first_even_if_first() {
        let windows = vec![
            ("main".to_string(), false),
            ("window_0".to_string(), false),
        ];
        assert_eq!(pick_target_window_label(&windows), Some("main".to_string()));
    }

    // ── is_path_already_pending ─────────────────────────────────────────

    #[test]
    fn already_pending_detected() {
        let mut pending = HashMap::new();
        pending.insert("main".to_string(), vec!["/tmp/a.md".to_string(), "/tmp/b.md".to_string()]);
        assert!(is_path_already_pending("/tmp/a.md", &pending));
        assert!(is_path_already_pending("/tmp/b.md", &pending));
    }

    #[test]
    fn not_pending_when_absent() {
        let mut pending = HashMap::new();
        pending.insert("main".to_string(), vec!["/tmp/a.md".to_string()]);
        assert!(!is_path_already_pending("/tmp/c.md", &pending));
    }

    #[test]
    fn not_pending_when_empty() {
        let pending = HashMap::new();
        assert!(!is_path_already_pending("/tmp/any.md", &pending));
    }

    #[test]
    fn already_pending_checks_all_windows() {
        let mut pending = HashMap::new();
        pending.insert("main".to_string(), vec!["/tmp/a.md".to_string()]);
        pending.insert("window_0".to_string(), vec!["/tmp/b.md".to_string()]);
        assert!(is_path_already_pending("/tmp/b.md", &pending));
    }
}
