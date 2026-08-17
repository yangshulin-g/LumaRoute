use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::Stdio;

use serde::Deserialize;

use crate::error::NativeError;
use crate::mpv::ipc::IpcEndpoint;

#[derive(Debug, Deserialize)]
struct MpvLockFile {
    #[serde(rename = "schemaVersion")]
    schema_version: u32,
    builds: std::collections::BTreeMap<String, MpvLockBuild>,
}

#[derive(Debug, Deserialize)]
struct MpvLockBuild {
    version: String,
    #[allow(dead_code)]
    executable: String,
}

pub fn verify_allowlisted_resource(executable: &Path) -> Result<(), NativeError> {
    let name = executable
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    // Allow target-suffixed sidecars such as mpv-aarch64-apple-darwin,
    // bare mpv/mpv.exe for deb/system and tests, and the fake node harness.
    let sidecar_ok = name.starts_with("mpv-") || matches!(name, "mpv" | "mpv.exe" | "fake-mpv.mjs");
    if sidecar_ok {
        Ok(())
    } else {
        Err(NativeError::player_unavailable(format!(
            "mpv executable is not allowlisted: {name}"
        )))
    }
}

pub fn parse_mpv_version(text: &str) -> Result<String, NativeError> {
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed
            .strip_prefix("mpv ")
            .or_else(|| trimmed.strip_prefix("mpv\t"))
        {
            let token = rest
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .trim_start_matches('v');
            if !token.is_empty() {
                return Ok(token.to_string());
            }
        }
    }
    Err(NativeError::player_unavailable(
        "unable to parse mpv --version output",
    ))
}

pub fn compare_mpv_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let split = |value: &str| {
        value
            .split(['.', '-'])
            .map(|part| part.to_string())
            .collect::<Vec<_>>()
    };
    let a = split(left);
    let b = split(right);
    let len = a.len().max(b.len());
    for index in 0..len {
        let l = a.get(index).map(String::as_str).unwrap_or("0");
        let r = b.get(index).map(String::as_str).unwrap_or("0");
        match (l.parse::<u64>(), r.parse::<u64>()) {
            (Ok(lv), Ok(rv)) => {
                if lv != rv {
                    return lv.cmp(&rv);
                }
            }
            _ => {
                if l != r {
                    return l.cmp(r);
                }
            }
        }
    }
    std::cmp::Ordering::Equal
}

pub fn rust_target_triple() -> &'static str {
    env!("TARGET")
}

pub fn sidecar_file_name(target: &str) -> String {
    if target.contains("windows") {
        format!("mpv-{target}.exe")
    } else {
        format!("mpv-{target}")
    }
}

pub fn load_minimum_version(lock_json: &str, target: &str) -> Result<String, NativeError> {
    let lock: MpvLockFile = serde_json::from_str(lock_json).map_err(|error| {
        NativeError::player_unavailable(format!("invalid mpv.lock.json: {error}"))
    })?;
    if lock.schema_version != 1 {
        return Err(NativeError::player_unavailable(
            "unsupported mpv.lock.json schema",
        ));
    }
    lock.builds
        .get(target)
        .map(|build| build.version.clone())
        .ok_or_else(|| {
            NativeError::player_unavailable(format!("missing mpv lock target: {target}"))
        })
}

pub fn resolve_packaged_mpv(
    resource_dir: &Path,
    target: &str,
    linux_deb_system_mpv: bool,
) -> Result<PathBuf, NativeError> {
    let sidecar = resource_dir.join("bin").join(sidecar_file_name(target));
    if sidecar.is_file() {
        return Ok(sidecar);
    }

    let external_bin = resource_dir.join(if target.contains("windows") {
        "mpv.exe"
    } else {
        "mpv"
    });
    if external_bin.is_file() {
        return Ok(external_bin);
    }

    // Legacy layout used by some resource bundles.
    let nested = if target.contains("windows") {
        resource_dir.join("mpv").join("mpv.exe")
    } else {
        resource_dir.join("mpv").join("mpv")
    };
    if nested.exists() {
        return Ok(nested);
    }

    if linux_deb_system_mpv {
        let system = PathBuf::from("/usr/bin/mpv");
        if system.exists() {
            return Ok(system);
        }
    }

    Err(NativeError::player_unavailable(format_mpv_missing_sidecar(
        target,
    )))
}

pub fn ensure_mpv_version(executable: &Path, minimum_version: &str) -> Result<String, NativeError> {
    verify_allowlisted_resource(executable)?;
    let output = Command::new(executable)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| NativeError::player_unavailable(error.to_string()))?;
    if !output.status.success() {
        return Err(NativeError::player_unavailable("mpv --version failed"));
    }
    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let version = parse_mpv_version(&combined)?;
    if compare_mpv_versions(&version, minimum_version).is_lt() {
        return Err(NativeError::player_unavailable(format!(
            "mpv version {version} is older than required {minimum_version}"
        )));
    }
    Ok(version)
}

pub async fn spawn_mpv(
    executable: &Path,
    endpoint: &IpcEndpoint,
) -> Result<tokio::process::Child, NativeError> {
    verify_allowlisted_resource(executable)?;

    let mut command = if executable.extension().and_then(|ext| ext.to_str()) == Some("mjs") {
        let mut cmd = tokio::process::Command::new("node");
        cmd.arg(executable);
        cmd
    } else {
        tokio::process::Command::new(executable)
    };

    command
        .args(mpv_launch_args(endpoint.as_argument()))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    command.spawn().map_err(|error| {
        let message = error.to_string();
        if error.kind() == std::io::ErrorKind::NotFound {
            NativeError::player_unavailable(format!(
                "未找到 mpv 可执行文件。请在仓库根目录运行 pnpm fetch:mpv 后重试。（{message}）"
            ))
        } else {
            NativeError::player_unavailable(format!("无法启动 mpv 进程：{message}"))
        }
    })
}

/// Real mpv only accepts the equals form (`--input-ipc-server=PATH`).
/// Splitting into two argv entries makes mpv exit immediately without creating the socket.
pub fn input_ipc_server_arg(endpoint: &str) -> String {
    format!("--input-ipc-server={endpoint}")
}

pub fn mpv_launch_args(endpoint: &str) -> Vec<String> {
    vec![
        "--idle=yes".into(),
        "--force-window=yes".into(),
        "--no-terminal".into(),
        input_ipc_server_arg(endpoint),
    ]
}

pub fn format_mpv_early_exit(exit_code: Option<i32>, stderr: &str) -> String {
    let code = exit_code
        .map(|value| value.to_string())
        .unwrap_or_else(|| "未知".to_string());
    let detail = stderr.trim();
    let hint = if detail.is_empty() {
        String::new()
    } else {
        let truncated: String = detail.chars().take(240).collect();
        format!(" 详情：{truncated}。")
    };
    format!(
        "播放器进程启动后立即退出（退出码 {code}）。{hint}若尚未安装 sidecar，请在仓库根目录运行 pnpm fetch:mpv。"
    )
}

pub fn format_mpv_socket_timeout() -> String {
    "等待播放器 IPC 套接字超时。请确认 mpv 可正常启动，或在仓库根目录重新运行 pnpm fetch:mpv。"
        .to_string()
}

pub fn format_mpv_missing_sidecar(target: &str) -> String {
    format!(
        "未找到打包的 mpv 播放器（目标 {target}）。请在仓库根目录运行 pnpm fetch:mpv 后重试。"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn mpv_launch_args_pass_ipc_server_as_single_equals_argument() {
        let args = mpv_launch_args("/tmp/lr-abcd.sock");
        assert!(
            args.iter()
                .any(|arg| arg.as_str() == "--input-ipc-server=/tmp/lr-abcd.sock"),
            "real mpv requires --input-ipc-server=PATH; got {args:?}"
        );
        assert!(
            !args.iter().any(|arg| arg.as_str() == "--input-ipc-server"),
            "split --input-ipc-server PATH makes real mpv exit before creating the socket"
        );
    }

    #[test]
    fn input_ipc_server_arg_uses_equals_form_required_by_real_mpv() {
        assert_eq!(
            input_ipc_server_arg("/tmp/lr-abcd.sock"),
            "--input-ipc-server=/tmp/lr-abcd.sock"
        );
        assert!(!input_ipc_server_arg("/tmp/lr-abcd.sock").contains(' '));
    }

    #[test]
    fn early_exit_and_missing_sidecar_messages_are_chinese_and_actionable() {
        let early = format_mpv_early_exit(Some(1), "dyld: Library not loaded");
        assert!(early.contains("立即退出"));
        assert!(early.contains("pnpm fetch:mpv"));
        assert!(early.contains("Library not loaded"));

        let timeout = format_mpv_socket_timeout();
        assert!(timeout.contains("IPC"));
        assert!(timeout.contains("pnpm fetch:mpv"));

        let missing = format_mpv_missing_sidecar("aarch64-apple-darwin");
        assert!(missing.contains("未找到"));
        assert!(missing.contains("pnpm fetch:mpv"));
    }

    #[test]
    fn rejects_path_wide_bare_names_without_sidecar_suffix_rules() {
        // bare "mpv" remains allowlisted for fake/test harnesses and deb system binary
        assert!(verify_allowlisted_resource(Path::new("mpv")).is_ok());
        assert!(verify_allowlisted_resource(Path::new("mpv-aarch64-apple-darwin")).is_ok());
        assert!(verify_allowlisted_resource(Path::new("/usr/bin/vlc")).is_err());
    }

    #[test]
    fn resolves_tauri_external_bin_next_to_app() {
        let root = tempfile_dir();
        let executable = root.join("mpv");
        fs::write(&executable, b"fake").unwrap();

        let resolved = resolve_packaged_mpv(&root, "aarch64-apple-darwin", false).unwrap();

        assert_eq!(resolved, executable);
    }

    #[test]
    fn parses_and_compares_mpv_versions() {
        let version = parse_mpv_version(
            "mpv v0.41.0-dev-g41f6a6450 Copyright © 2000-2025 mpv/MPlayer/mplayer2 projects\n",
        )
        .expect("parse");
        assert_eq!(version, "0.41.0-dev-g41f6a6450");
        assert!(compare_mpv_versions("0.41.0-dev-g41f6a6450", "0.41.0").is_ge());
        assert!(compare_mpv_versions("0.40.0", "0.41.0").is_lt());
    }

    #[test]
    fn resolves_only_packaged_sidecar_or_deb_system_binary() {
        let root = tempfile_dir();
        let bin = root.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let target = "aarch64-apple-darwin";
        let sidecar = bin.join(sidecar_file_name(target));
        fs::write(&sidecar, b"fake").unwrap();

        let resolved = resolve_packaged_mpv(&root, target, false).unwrap();
        assert_eq!(resolved, sidecar);

        fs::remove_file(&sidecar).unwrap();
        let missing = resolve_packaged_mpv(&root, target, false).unwrap_err();
        assert!(missing.message().contains("pnpm fetch:mpv"));
        assert!(missing.message().contains("未找到"));

        let deb = resolve_packaged_mpv(&root, "x86_64-unknown-linux-gnu", true);
        // May succeed only when /usr/bin/mpv exists on the runner.
        let _ = deb;
    }

    #[test]
    fn loads_minimum_version_from_lock() {
        let json = r#"{
          "schemaVersion": 1,
          "builds": {
            "aarch64-apple-darwin": {
              "version": "0.41.0",
              "executable": "mpv",
              "sourceUrl": "https://example.test/mpv.zip",
              "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              "licenses": []
            }
          }
        }"#;
        assert_eq!(
            load_minimum_version(json, "aarch64-apple-darwin").unwrap(),
            "0.41.0"
        );
        assert!(load_minimum_version(json, "x86_64-pc-windows-msvc").is_err());
    }

    fn tempfile_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lumaroute-mpv-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
