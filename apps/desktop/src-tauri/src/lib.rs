pub mod commands;
pub mod credentials;
pub mod error;
pub mod mpv;
mod storage;

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::error::NativeError;
use crate::mpv::process::{
    ensure_mpv_version, load_minimum_version, resolve_mpv_lock_path, resolve_packaged_mpv_from,
    rust_target_triple,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:lumaroute.db", storage::migrations())
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let runtime_dir = app
                .path()
                .app_cache_dir()
                .map(|dir| dir.join("mpv"))
                .unwrap_or_else(|_| std::env::temp_dir().join("lr-mpv"));
            let executable = std::fs::create_dir_all(&runtime_dir)
                .map_err(|error| NativeError::player_unavailable(error.to_string()))
                .and_then(|_| resolve_mpv_executable(app));
            if let Err(error) = &executable {
                eprintln!(
                    "LumaRoute player unavailable during startup: {}",
                    error.code()
                );
            }
            app.manage(Arc::new(commands::player::PlayerState::new(
                runtime_dir,
                executable,
            )));
            Ok(())
        })
        .manage(credentials::CredentialState::keyring())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("app-close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::health_check,
            commands::credentials::credential_set,
            commands::credentials::credential_get,
            commands::credentials::credential_delete,
            commands::player::player_play,
            commands::player::player_pause,
            commands::player::player_resume,
            commands::player::player_seek,
            commands::player::player_stop,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|_| eprintln!("LumaRoute runtime stopped with an error"));
}

fn resolve_mpv_executable(app: &tauri::App) -> Result<PathBuf, NativeError> {
    if let Ok(path) = std::env::var("LUMAROUTE_MPV_PATH") {
        // Test/dev override only; production resolution never searches PATH.
        return Ok(PathBuf::from(path));
    }

    let target = rust_target_triple();
    let resource_dir = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| NativeError::player_unavailable(error.to_string()))?
    };
    let linux_deb = cfg!(target_os = "linux")
        && std::env::var("LUMAROUTE_LINUX_BUNDLE")
            .map(|value| value.eq_ignore_ascii_case("deb"))
            .unwrap_or(false);

    let executable_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(PathBuf::from));
    let executable =
        resolve_packaged_mpv_from(&resource_dir, executable_dir.as_deref(), target, linux_deb)?;
    let lock_path = resolve_mpv_lock_path(&resource_dir);
    let lock_json = std::fs::read_to_string(&lock_path).map_err(|error| {
        NativeError::player_unavailable(format!(
            "failed to read packaged mpv.lock.json at {}: {error}",
            lock_path.display()
        ))
    })?;
    let minimum = load_minimum_version(&lock_json, target)?;
    ensure_mpv_version(&executable, &minimum)?;
    Ok(executable)
}
