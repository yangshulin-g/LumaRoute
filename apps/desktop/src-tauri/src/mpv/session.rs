use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio::sync::mpsc;

use crate::error::NativeError;
use crate::mpv::ipc::{self, IpcEndpoint, IpcReader, IpcWriter};
use crate::mpv::process::{format_mpv_early_exit, format_mpv_socket_timeout, spawn_mpv};
use crate::mpv::protocol::{
    control_command, map_mpv_event_with_state, observe_commands, play_commands, ControlAction,
    MpvCommand, NativePlaybackPlan, NativePlayerEvent,
};

pub struct MpvSession {
    endpoint: IpcEndpoint,
    endpoint_display: String,
    executable: PathBuf,
    runtime_dir: PathBuf,
    child: Option<tokio::process::Child>,
    writer: Option<IpcWriter>,
    events: mpsc::Receiver<NativePlayerEvent>,
    event_task: Option<tokio::task::JoinHandle<()>>,
    pending_started: Option<NativePlayerEvent>,
    position_seconds: f64,
    duration_seconds: f64,
}

impl MpvSession {
    pub async fn start_with_executable(
        runtime_dir: &Path,
        executable: &Path,
    ) -> Result<Self, NativeError> {
        ipc::prepare_runtime_dir(runtime_dir).await?;
        let endpoint = ipc::random_endpoint(runtime_dir);
        let endpoint_display = endpoint.display();
        let mut child = spawn_mpv(executable, &endpoint).await?;
        wait_for_endpoint_or_child_exit(&endpoint, &mut child).await?;
        ipc::secure_endpoint(&endpoint).await?;

        let (mut writer, reader) = ipc::connect(&endpoint).await?;
        for command in observe_commands() {
            send_command(&mut writer, &command).await?;
        }

        let (event_tx, event_rx) = mpsc::channel(64);
        let event_task = tokio::spawn(read_events(reader, event_tx));

        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                use tokio::io::AsyncReadExt;
                let mut stderr = stderr;
                let mut buf = [0_u8; 512];
                loop {
                    match stderr.read(&mut buf).await {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {}
                    }
                }
            });
        }

        Ok(Self {
            endpoint,
            endpoint_display,
            executable: executable.to_path_buf(),
            runtime_dir: runtime_dir.to_path_buf(),
            child: Some(child),
            writer: Some(writer),
            events: event_rx,
            event_task: Some(event_task),
            pending_started: None,
            position_seconds: 0.0,
            duration_seconds: 0.0,
        })
    }

    pub fn endpoint_display(&self) -> &str {
        &self.endpoint_display
    }

    pub async fn endpoint_is_current_user_only(&self) -> bool {
        self.endpoint.is_current_user_only().await
    }

    pub async fn play(&mut self, plan: NativePlaybackPlan) -> Result<(), NativeError> {
        self.ensure_started().await?;
        self.position_seconds = plan.start_position_seconds;
        self.duration_seconds = plan.duration_seconds;
        for command in play_commands(&plan) {
            let writer = self.writer_mut()?;
            send_command(writer, &command).await?;
        }
        self.wait_for_file_loaded(Duration::from_secs(45)).await?;
        if plan.start_position_seconds > 0.0 {
            self.seek(plan.start_position_seconds).await?;
        }
        Ok(())
    }

    pub async fn pause(&mut self) -> Result<(), NativeError> {
        let writer = self.writer_mut()?;
        send_command(writer, &control_command(ControlAction::Pause)).await
    }

    pub async fn resume(&mut self) -> Result<(), NativeError> {
        let writer = self.writer_mut()?;
        send_command(writer, &control_command(ControlAction::Resume)).await
    }

    pub async fn seek(&mut self, seconds: f64) -> Result<(), NativeError> {
        let writer = self.writer_mut()?;
        send_command(writer, &control_command(ControlAction::Seek(seconds))).await
    }

    pub async fn stop(&mut self) -> Result<(), NativeError> {
        if let Some(writer) = self.writer.as_mut() {
            let _ = send_command(writer, &control_command(ControlAction::Stop)).await;
        }
        self.shutdown_process().await;
        self.endpoint.cleanup().await
    }

    pub async fn next_event(&mut self) -> Option<NativePlayerEvent> {
        if let Some(event) = self.pending_started.take() {
            self.remember(&event);
            return Some(event);
        }
        let event = self.events.recv().await?;
        self.remember(&event);
        Some(event)
    }

    fn remember(&mut self, event: &NativePlayerEvent) {
        match event {
            NativePlayerEvent::Started {
                position_seconds,
                duration_seconds,
            }
            | NativePlayerEvent::Position {
                position_seconds,
                duration_seconds,
            }
            | NativePlayerEvent::Paused {
                position_seconds,
                duration_seconds,
            }
            | NativePlayerEvent::Resumed {
                position_seconds,
                duration_seconds,
            }
            | NativePlayerEvent::Seeked {
                position_seconds,
                duration_seconds,
            }
            | NativePlayerEvent::Ended {
                position_seconds,
                duration_seconds,
            }
            | NativePlayerEvent::Stopped {
                position_seconds,
                duration_seconds,
            } => {
                self.position_seconds = *position_seconds;
                self.duration_seconds = *duration_seconds;
            }
            NativePlayerEvent::Error { .. } => {}
        }
    }

    fn writer_mut(&mut self) -> Result<&mut IpcWriter, NativeError> {
        self.writer
            .as_mut()
            .ok_or_else(|| NativeError::player_unavailable("mpv session is not running"))
    }

    async fn ensure_started(&mut self) -> Result<(), NativeError> {
        if self.writer.is_some() {
            return Ok(());
        }
        let restarted = Self::start_with_executable(&self.runtime_dir, &self.executable).await?;
        *self = restarted;
        Ok(())
    }

    async fn wait_for_file_loaded(&mut self, timeout: Duration) -> Result<(), NativeError> {
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return Err(NativeError::playback_failed(
                    "timed out waiting for mpv file-loaded",
                ));
            }
            match tokio::time::timeout(remaining, self.events.recv()).await {
                Ok(Some(event)) => match event {
                    NativePlayerEvent::Started { .. } => {
                        self.pending_started = Some(event);
                        return Ok(());
                    }
                    NativePlayerEvent::Error { message, .. } => {
                        return Err(NativeError::playback_failed(message));
                    }
                    NativePlayerEvent::Ended { .. } | NativePlayerEvent::Stopped { .. } => {
                        return Err(NativeError::playback_failed(
                            "mpv ended before playback started",
                        ));
                    }
                    _ => {}
                },
                Ok(None) => return Err(NativeError::playback_failed("mpv event channel closed")),
                Err(_) => {
                    return Err(NativeError::playback_failed(
                        "timed out waiting for mpv file-loaded",
                    ))
                }
            }
        }
    }

    async fn shutdown_process(&mut self) {
        if let Some(task) = self.event_task.take() {
            task.abort();
        }
        self.writer.take();
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
    }
}

async fn wait_for_endpoint_or_child_exit(
    endpoint: &IpcEndpoint,
    child: &mut tokio::process::Child,
) -> Result<(), NativeError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        if ipc::endpoint_ready(endpoint).await {
            return Ok(());
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                let stderr = read_stderr_snippet(child).await;
                return Err(NativeError::player_unavailable(format_mpv_early_exit(
                    status.code(),
                    &stderr,
                )));
            }
            Ok(None) => {}
            Err(error) => {
                return Err(NativeError::player_unavailable(format!(
                    "无法检查播放器进程状态：{error}"
                )));
            }
        }

        if tokio::time::Instant::now() >= deadline {
            if let Ok(Some(status)) = child.try_wait() {
                let stderr = read_stderr_snippet(child).await;
                return Err(NativeError::player_unavailable(format_mpv_early_exit(
                    status.code(),
                    &stderr,
                )));
            }
            return Err(NativeError::player_unavailable(format_mpv_socket_timeout()));
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

async fn read_stderr_snippet(child: &mut tokio::process::Child) -> String {
    use tokio::io::AsyncReadExt;
    let Some(mut stderr) = child.stderr.take() else {
        return String::new();
    };
    let mut buf = Vec::new();
    let _ = tokio::time::timeout(Duration::from_millis(200), stderr.read_to_end(&mut buf)).await;
    String::from_utf8_lossy(&buf).chars().take(400).collect()
}

async fn send_command(writer: &mut IpcWriter, command: &MpvCommand) -> Result<(), NativeError> {
    command
        .validate_allowlisted()
        .map_err(NativeError::invalid_input)?;
    let line = command
        .as_json_line()
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
    writer.send_line(&line).await
}

async fn read_events(mut reader: IpcReader, event_tx: mpsc::Sender<NativePlayerEvent>) {
    let mut position = 0.0_f64;
    let mut duration = 0.0_f64;
    let mut file_loaded = false;
    let mut started_emitted = false;
    let mut skip_initial_position = false;

    loop {
        let line = match reader.read_line().await {
            Ok(line) => line,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(Some(event)) = map_mpv_event_with_state(&line, position, duration) else {
            continue;
        };

        match event {
            NativePlayerEvent::Started { .. } => {
                file_loaded = true;
                // Emit Started even when duration is still unknown so play() can
                // unblock; duration updates arrive via later Position events.
                if !started_emitted {
                    started_emitted = true;
                    skip_initial_position = true;
                    let _ = event_tx
                        .send(NativePlayerEvent::Started {
                            position_seconds: position,
                            duration_seconds: duration,
                        })
                        .await;
                }
            }
            NativePlayerEvent::Position {
                position_seconds,
                duration_seconds,
            } => {
                position = position_seconds;
                duration = duration_seconds;
                if file_loaded && !started_emitted {
                    started_emitted = true;
                    skip_initial_position = true;
                    let _ = event_tx
                        .send(NativePlayerEvent::Started {
                            position_seconds: position,
                            duration_seconds: duration,
                        })
                        .await;
                } else if started_emitted {
                    if skip_initial_position {
                        skip_initial_position = false;
                    } else {
                        let _ = event_tx
                            .send(NativePlayerEvent::Position {
                                position_seconds: position,
                                duration_seconds: duration,
                            })
                            .await;
                    }
                }
            }
            NativePlayerEvent::Paused {
                position_seconds,
                duration_seconds,
            } => {
                position = position_seconds;
                duration = duration_seconds;
                let _ = event_tx
                    .send(NativePlayerEvent::Paused {
                        position_seconds: position,
                        duration_seconds: duration,
                    })
                    .await;
            }
            NativePlayerEvent::Resumed {
                position_seconds,
                duration_seconds,
            } => {
                position = position_seconds;
                duration = duration_seconds;
                let _ = event_tx
                    .send(NativePlayerEvent::Resumed {
                        position_seconds: position,
                        duration_seconds: duration,
                    })
                    .await;
            }
            NativePlayerEvent::Seeked {
                position_seconds,
                duration_seconds,
            } => {
                position = position_seconds;
                duration = duration_seconds;
                let _ = event_tx
                    .send(NativePlayerEvent::Seeked {
                        position_seconds: position,
                        duration_seconds: duration,
                    })
                    .await;
            }
            other => {
                let _ = event_tx.send(other).await;
            }
        }
    }
}
