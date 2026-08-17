#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

use std::path::{Path, PathBuf};

use crate::error::NativeError;

#[derive(Debug, Clone)]
pub enum IpcEndpoint {
    #[cfg(unix)]
    Unix(PathBuf),
    #[cfg(windows)]
    Windows(String),
}

impl IpcEndpoint {
    pub fn as_argument(&self) -> &str {
        match self {
            #[cfg(unix)]
            Self::Unix(path) => path.to_str().expect("utf8 ipc path"),
            #[cfg(windows)]
            Self::Windows(name) => name.as_str(),
        }
    }

    pub fn display(&self) -> String {
        self.as_argument().to_owned()
    }

    pub async fn cleanup(&self) -> Result<(), NativeError> {
        match self {
            #[cfg(unix)]
            Self::Unix(path) => unix::cleanup(path).await,
            #[cfg(windows)]
            Self::Windows(_) => Ok(()),
        }
    }

    pub async fn is_current_user_only(&self) -> bool {
        match self {
            #[cfg(unix)]
            Self::Unix(path) => unix::is_mode_0600(path).await,
            #[cfg(windows)]
            Self::Windows(name) => windows::pipe_is_current_user_only(name).await,
        }
    }
}

pub fn random_endpoint(runtime_dir: &Path) -> IpcEndpoint {
    let id = uuid::Uuid::new_v4();
    // macOS sockaddr_un path limit is ~104 bytes; keep names short.
    let short = &id.to_string()[..8];
    #[cfg(unix)]
    {
        return IpcEndpoint::Unix(runtime_dir.join(format!("lr-{short}.sock")));
    }
    #[cfg(windows)]
    {
        let _ = runtime_dir;
        return IpcEndpoint::Windows(format!(r"\\.\pipe\lumaroute-mpv-{id}"));
    }
}

pub async fn prepare_runtime_dir(runtime_dir: &Path) -> Result<(), NativeError> {
    #[cfg(unix)]
    return unix::prepare_runtime_dir(runtime_dir).await;
    #[cfg(windows)]
    {
        tokio::fs::create_dir_all(runtime_dir)
            .await
            .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
        Ok(())
    }
}

pub async fn wait_for_endpoint(endpoint: &IpcEndpoint) -> Result<(), NativeError> {
    match endpoint {
        #[cfg(unix)]
        IpcEndpoint::Unix(path) => unix::wait_for_socket(path).await,
        #[cfg(windows)]
        IpcEndpoint::Windows(name) => windows::wait_for_pipe(name).await,
    }
}

pub async fn endpoint_ready(endpoint: &IpcEndpoint) -> bool {
    match endpoint {
        #[cfg(unix)]
        IpcEndpoint::Unix(path) => path.exists(),
        #[cfg(windows)]
        IpcEndpoint::Windows(name) => windows::pipe_exists(name).await,
    }
}

pub async fn secure_endpoint(endpoint: &IpcEndpoint) -> Result<(), NativeError> {
    match endpoint {
        #[cfg(unix)]
        IpcEndpoint::Unix(path) => unix::secure_socket(path).await,
        #[cfg(windows)]
        IpcEndpoint::Windows(name) => windows::secure_pipe(name).await,
    }
}

pub struct IpcWriter {
    #[cfg(unix)]
    inner: unix::UnixWriter,
    #[cfg(windows)]
    inner: windows::WindowsWriter,
}

pub struct IpcReader {
    #[cfg(unix)]
    inner: unix::UnixReader,
    #[cfg(windows)]
    inner: windows::WindowsReader,
}

pub async fn connect(endpoint: &IpcEndpoint) -> Result<(IpcWriter, IpcReader), NativeError> {
    match endpoint {
        #[cfg(unix)]
        IpcEndpoint::Unix(path) => {
            let (writer, reader) = unix::connect(path).await?;
            Ok((IpcWriter { inner: writer }, IpcReader { inner: reader }))
        }
        #[cfg(windows)]
        IpcEndpoint::Windows(name) => {
            let (writer, reader) = windows::connect(name).await?;
            Ok((IpcWriter { inner: writer }, IpcReader { inner: reader }))
        }
    }
}

impl IpcWriter {
    pub async fn send_line(&mut self, line: &str) -> Result<(), NativeError> {
        self.inner.send_line(line).await
    }
}

impl IpcReader {
    pub async fn read_line(&mut self) -> Result<String, NativeError> {
        self.inner.read_line().await
    }
}

pub async fn endpoint_reachable(endpoint: &str) -> bool {
    #[cfg(unix)]
    {
        tokio::fs::try_exists(Path::new(endpoint))
            .await
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        windows::pipe_exists(endpoint).await
    }
}
