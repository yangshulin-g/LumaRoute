use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;

use crate::error::NativeError;
use crate::mpv::process::format_mpv_socket_timeout;

pub async fn prepare_runtime_dir(runtime_dir: &Path) -> Result<(), NativeError> {
    tokio::fs::create_dir_all(runtime_dir)
        .await
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
    let mut perms = tokio::fs::metadata(runtime_dir)
        .await
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?
        .permissions();
    perms.set_mode(0o700);
    tokio::fs::set_permissions(runtime_dir, perms)
        .await
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
    Ok(())
}

pub async fn wait_for_socket(path: &Path) -> Result<(), NativeError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        if path.exists() {
            return Ok(());
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(NativeError::player_unavailable(format_mpv_socket_timeout()));
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

pub async fn secure_socket(path: &Path) -> Result<(), NativeError> {
    let mut perms = tokio::fs::metadata(path)
        .await
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?
        .permissions();
    perms.set_mode(0o600);
    tokio::fs::set_permissions(path, perms)
        .await
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
    Ok(())
}

pub async fn is_mode_0600(path: &Path) -> bool {
    match tokio::fs::metadata(path).await {
        Ok(meta) => meta.permissions().mode() & 0o777 == 0o600,
        Err(_) => false,
    }
}

pub async fn cleanup(path: &Path) -> Result<(), NativeError> {
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(NativeError::player_unavailable(error.to_string())),
    }
}

pub struct UnixWriter {
    writer: tokio::net::unix::OwnedWriteHalf,
}

pub struct UnixReader {
    reader: BufReader<tokio::net::unix::OwnedReadHalf>,
}

pub async fn connect(path: &Path) -> Result<(UnixWriter, UnixReader), NativeError> {
    let stream = UnixStream::connect(path)
        .await
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
    let (read, write) = stream.into_split();
    Ok((
        UnixWriter { writer: write },
        UnixReader {
            reader: BufReader::new(read),
        },
    ))
}

impl UnixWriter {
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

impl UnixReader {
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
