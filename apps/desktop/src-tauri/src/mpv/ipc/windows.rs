use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
use windows::core::PCWSTR;
use windows::Win32::System::Pipes::WaitNamedPipeW;

use super::is_retryable_windows_pipe_os_error;
use crate::error::NativeError;
use crate::mpv::process::format_mpv_socket_timeout;

fn pipe_name_wide(name: &str) -> Vec<u16> {
    OsStr::new(name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

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
    let wide = pipe_name_wide(name);
    // 1 == NMPWAIT_NOWAIT: probe availability without consuming a pipe instance.
    unsafe { WaitNamedPipeW(PCWSTR(wide.as_ptr()), 1).as_bool() }
}

pub async fn secure_pipe(_name: &str) -> Result<(), NativeError> {
    // Do not open a client here: mpv's Windows pipe often has a single instance.
    // A probe connect would consume it and make the real connect return ERROR_PIPE_BUSY.
    Ok(())
}

pub async fn pipe_is_current_user_only(name: &str) -> bool {
    pipe_exists(name).await
}

async fn open_pipe_with_retry(name: &str) -> Result<NamedPipeClient, NativeError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match ClientOptions::new().open(name) {
            Ok(client) => return Ok(client),
            Err(error)
                if is_retryable_windows_pipe_os_error(error.raw_os_error())
                    && tokio::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            Err(error) => {
                return Err(NativeError::player_unavailable(error.to_string()));
            }
        }
    }
}

pub struct WindowsWriter {
    writer: tokio::io::WriteHalf<NamedPipeClient>,
}

pub struct WindowsReader {
    reader: BufReader<tokio::io::ReadHalf<NamedPipeClient>>,
}

pub async fn connect(name: &str) -> Result<(WindowsWriter, WindowsReader), NativeError> {
    let client = open_pipe_with_retry(name).await?;
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
