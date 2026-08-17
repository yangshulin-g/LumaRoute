use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::error::NativeError;
use crate::mpv::protocol::NativePlaybackPlan;
use crate::mpv::session::MpvSession;

pub struct PlayerState {
    inner: Mutex<PlayerInner>,
}

struct PlayerInner {
    runtime_dir: PathBuf,
    executable: Result<PathBuf, String>,
    control_tx: Option<tokio::sync::mpsc::Sender<PlayerControl>>,
    pump: Option<tokio::task::JoinHandle<()>>,
}

enum PlayerControl {
    Pause,
    Resume,
    Seek(f64),
    Stop,
}

impl PlayerState {
    pub fn new(runtime_dir: PathBuf, executable: Result<PathBuf, NativeError>) -> Self {
        Self {
            inner: Mutex::new(PlayerInner {
                runtime_dir,
                executable: executable.map_err(|error| error.message().to_owned()),
                control_tx: None,
                pump: None,
            }),
        }
    }
}

impl PlayerInner {
    fn executable(&self) -> Result<PathBuf, NativeError> {
        self.executable
            .as_ref()
            .cloned()
            .map_err(|message| NativeError::player_unavailable(message.clone()))
    }
}

#[tauri::command]
pub async fn player_play(
    app: AppHandle,
    state: State<'_, Arc<PlayerState>>,
    plan: NativePlaybackPlan,
) -> Result<(), NativeError> {
    let mut inner = state.inner.lock().await;
    shutdown_locked(&mut inner).await;

    let executable = inner.executable()?;
    let mut session = MpvSession::start_with_executable(&inner.runtime_dir, &executable).await?;
    session.play(plan).await?;

    let (control_tx, mut control_rx) = tokio::sync::mpsc::channel::<PlayerControl>(8);
    let app_handle = app.clone();
    let pump = tokio::spawn(async move {
        loop {
            tokio::select! {
                command = control_rx.recv() => {
                    match command {
                        Some(PlayerControl::Pause) => {
                            let _ = session.pause().await;
                        }
                        Some(PlayerControl::Resume) => {
                            let _ = session.resume().await;
                        }
                        Some(PlayerControl::Seek(seconds)) => {
                            let _ = session.seek(seconds).await;
                        }
                        Some(PlayerControl::Stop) | None => {
                            let _ = session.stop().await;
                            break;
                        }
                    }
                }
                event = session.next_event() => {
                    match event {
                        Some(event) => {
                            let _ = app_handle.emit("player://event", event);
                        }
                        None => break,
                    }
                }
            }
        }
    });

    inner.control_tx = Some(control_tx);
    inner.pump = Some(pump);
    Ok(())
}

#[tauri::command]
pub async fn player_pause(state: State<'_, Arc<PlayerState>>) -> Result<(), NativeError> {
    send_control(&state, PlayerControl::Pause).await
}

#[tauri::command]
pub async fn player_resume(state: State<'_, Arc<PlayerState>>) -> Result<(), NativeError> {
    send_control(&state, PlayerControl::Resume).await
}

#[tauri::command]
pub async fn player_seek(
    state: State<'_, Arc<PlayerState>>,
    position_seconds: f64,
) -> Result<(), NativeError> {
    send_control(&state, PlayerControl::Seek(position_seconds)).await
}

#[tauri::command]
pub async fn player_stop(state: State<'_, Arc<PlayerState>>) -> Result<(), NativeError> {
    let mut inner = state.inner.lock().await;
    shutdown_locked(&mut inner).await;
    Ok(())
}

async fn send_control(
    state: &State<'_, Arc<PlayerState>>,
    control: PlayerControl,
) -> Result<(), NativeError> {
    let inner = state.inner.lock().await;
    let tx = inner
        .control_tx
        .as_ref()
        .ok_or_else(|| NativeError::player_unavailable("player session is not running"))?;
    tx.send(control)
        .await
        .map_err(|_| NativeError::player_unavailable("player control channel closed"))
}

async fn shutdown_locked(inner: &mut PlayerInner) {
    if let Some(tx) = inner.control_tx.take() {
        let _ = tx.send(PlayerControl::Stop).await;
    }
    if let Some(handle) = inner.pump.take() {
        let _ = handle.await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn unavailable_player_state_returns_player_unavailable() {
        let state = PlayerState::new(
            std::env::temp_dir(),
            Err(NativeError::player_unavailable("mpv is unavailable")),
        );
        let inner = state.inner.lock().await;

        let error = inner.executable().unwrap_err();

        assert_eq!(error.code(), "PlayerUnavailable");
    }
}
