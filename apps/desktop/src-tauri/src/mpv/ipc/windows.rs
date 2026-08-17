use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};

use crate::error::NativeError;
use crate::mpv::process::format_mpv_socket_timeout;

pub async fn wait_for_pipe(name: &str) -> Result<(), NativeError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        if pipe_exists(name).await {
            return Ok(());
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(NativeError::player_unavailable(format_mpv_socket_timeout()));
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

pub async fn pipe_exists(name: &str) -> bool {
    ClientOptions::new().open(name).is_ok()
}

pub async fn secure_pipe(name: &str) -> Result<(), NativeError> {
    let _client = ClientOptions::new()
        .open(name)
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
    let _ = name;
    Ok(())
}

pub async fn pipe_is_current_user_only(name: &str) -> bool {
    secure_pipe(name).await.is_ok()
}

pub struct WindowsWriter {
    writer: tokio::io::WriteHalf<NamedPipeClient>,
}

pub struct WindowsReader {
    reader: BufReader<tokio::io::ReadHalf<NamedPipeClient>>,
}

pub async fn connect(name: &str) -> Result<(WindowsWriter, WindowsReader), NativeError> {
    let client = ClientOptions::new()
        .open(name)
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
    let (read, write) = tokio::io::split(client);
    Ok((
        WindowsWriter { writer: write },
        WindowsReader {
            reader: BufReader::new(read),
        },
    ))
}

impl WindowsWriter {
    pub async fn send_line(&mut self, line: &str) -> Result<(), NativeError> {
        self.writer
            .write_all(line.as_bytes())
            .await
            .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
        if !line.ends_with('\n') {
            self.writer
                .write_all(b"\n")
                .await
                .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
        }
        self.writer
            .flush()
            .await
            .map_err(|error| NativeError::player_unavailable(error.to_string()))
    }
}

impl WindowsReader {
    pub async fn read_line(&mut self) -> Result<String, NativeError> {
        let mut line = String::new();
        let read = self
            .reader
            .read_line(&mut line)
            .await
            .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
        if read == 0 {
            return Err(NativeError::player_unavailable("mpv ipc closed"));
        }
        if line.ends_with('\n') {
            line.pop();
            if line.ends_with('\r') {
                line.pop();
            }
        }
        Ok(line)
    }
}
