use std::path::{Path, PathBuf};
use std::time::Duration;

use lumaroute_lib::mpv::protocol::{NativePlaybackPlan, NativePlayerEvent};
use lumaroute_lib::mpv::session::MpvSession;

fn fake_mpv_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tests/integration/support/fake-mpv.mjs")
        .canonicalize()
        .expect("fake-mpv.mjs must exist")
}

fn test_plan() -> NativePlaybackPlan {
    use std::collections::BTreeMap;
    NativePlaybackPlan {
        item_id: "item-1".into(),
        media_source_id: "source-1".into(),
        play_session_id: "session-1".into(),
        stream_url: "https://media.example/stream.mkv".into(),
        request_headers: BTreeMap::from([("X-Emby-Token".into(), "secret-token".into())]),
        container: "mkv".into(),
        video_codec: "h264".into(),
        audio_codec: Some("aac".into()),
        bitrate: Some(8_000_000),
        duration_seconds: 120.0,
        method: "direct-play".into(),
        start_position_seconds: 0.0,
    }
}

struct TestHarness {
    session: MpvSession,
}

impl TestHarness {
    async fn start() -> Self {
        let runtime_dir = tempfile_runtime_dir();
        let session = MpvSession::start_with_executable(&runtime_dir, &fake_mpv_path())
            .await
            .expect("start mpv session");
        Self { session }
    }

    async fn start_rejecting_load(message: &str) -> Self {
        let runtime_dir = tempfile_runtime_dir();
        let script = runtime_dir.join("fake-mpv.mjs");
        let reject = serde_json::to_string(message).expect("serialize reject message");
        std::fs::write(
            &script,
            format!(
                r#"#!/usr/bin/env node
import fs from 'node:fs'
import net from 'node:net'

const REJECT = {reject}
const endpoint = process.argv
  .find((arg) => arg.startsWith('--input-ipc-server='))
  ?.split('=')[1]

if (!endpoint) {{
  process.stderr.write('missing --input-ipc-server\n')
  process.exit(2)
}}

function attachSocket(socket) {{
  socket.setEncoding('utf8')
  let buffer = ''
  socket.on('data', (chunk) => {{
    buffer += chunk
    for (;;) {{
      const newline = buffer.indexOf('\n')
      if (newline < 0) break
      const raw = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!raw.trim()) continue
      const request = JSON.parse(raw)
      const command = request.command?.[0]
      if (command === 'loadfile') {{
        socket.write(`${{JSON.stringify({{ request_id: request.request_id, error: REJECT }})}}\n`)
        continue
      }}
      socket.write(`${{JSON.stringify({{ request_id: request.request_id, error: 'success' }})}}\n`)
    }}
  }})
}}

const isPipe = endpoint.startsWith('\\\\.\\pipe\\') || endpoint.startsWith('//./pipe/')
if (!isPipe) {{
  try {{ fs.unlinkSync(endpoint) }} catch {{}}
}}
const server = net.createServer(attachSocket)
server.listen(endpoint)
process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))
"#,
                reject = reject
            ),
        )
        .expect("write rejecting fake-mpv");
        let session = MpvSession::start_with_executable(&runtime_dir, &script)
            .await
            .expect("start rejecting mpv session");
        Self { session }
    }

    fn endpoint(&self) -> &str {
        self.session.endpoint_display()
    }

    async fn endpoint_is_current_user_only(&self) -> bool {
        self.session.endpoint_is_current_user_only().await
    }

    async fn play(
        &mut self,
        plan: NativePlaybackPlan,
    ) -> Result<(), lumaroute_lib::error::NativeError> {
        self.session.play(plan).await
    }

    async fn pause(&mut self) -> Result<(), lumaroute_lib::error::NativeError> {
        self.session.pause().await
    }

    async fn seek(&mut self, seconds: f64) -> Result<(), lumaroute_lib::error::NativeError> {
        self.session.seek(seconds).await
    }

    async fn stop(&mut self) -> Result<(), lumaroute_lib::error::NativeError> {
        self.session.stop().await
    }

    async fn next_event(&mut self) -> NativePlayerEvent {
        tokio::time::timeout(Duration::from_secs(5), self.session.next_event())
            .await
            .expect("event timeout")
            .expect("event stream closed")
    }
}

fn packaged_sidecar_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources/bin")
        .join(format!(
            "mpv-{}",
            lumaroute_lib::mpv::process::rust_target_triple()
        ))
}

fn tempfile_runtime_dir() -> PathBuf {
    // Keep the directory path short: macOS unix socket paths are capped near 104 bytes.
    let dir = std::env::temp_dir().join(format!("lr-{}", &uuid::Uuid::new_v4().to_string()[..8]));
    std::fs::create_dir_all(&dir).expect("create runtime dir");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&dir).unwrap().permissions();
        perms.set_mode(0o700);
        std::fs::set_permissions(&dir, perms).unwrap();
    }
    dir
}

async fn endpoint_exists(endpoint: &str) -> bool {
    #[cfg(unix)]
    {
        Path::new(endpoint).exists()
    }
    #[cfg(windows)]
    {
        lumaroute_lib::mpv::ipc::endpoint_reachable(endpoint).await
    }
}

#[cfg(target_os = "macos")]
#[test]
fn packaged_mpv_has_a_valid_standalone_signature_when_available() {
    let sidecar = packaged_sidecar_path();
    if !sidecar.is_file() {
        eprintln!("skip: packaged mpv sidecar missing at {}", sidecar.display());
        return;
    }

    let output = std::process::Command::new("codesign")
        .args(["--verify", "--strict", "--verbose=4"])
        .arg(&sidecar)
        .output()
        .expect("run codesign verification");
    assert!(
        output.status.success(),
        "standalone sidecar signature must remain valid after extraction: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[tokio::test]
async fn real_packaged_mpv_creates_ipc_socket_when_available() {
    let sidecar = packaged_sidecar_path();
    if !sidecar.is_file() {
        eprintln!("skip: packaged mpv sidecar missing at {}", sidecar.display());
        return;
    }

    let runtime_dir = tempfile_runtime_dir();
    let mut session = MpvSession::start_with_executable(&runtime_dir, &sidecar)
        .await
        .expect("real mpv should create IPC with equals-form --input-ipc-server");
    assert!(endpoint_exists(session.endpoint_display()).await);
    session.stop().await.expect("stop real mpv");
}

#[tokio::test]
async fn real_packaged_mpv_creates_ipc_socket_when_required() {
    let sidecar = packaged_sidecar_path();
    if !sidecar.is_file() {
        if std::env::var("LUMAROUTE_REQUIRE_REAL_MPV").as_deref() == Ok("1") {
            panic!("required packaged mpv sidecar missing at {}", sidecar.display());
        }
        eprintln!("skip: packaged mpv sidecar missing at {}", sidecar.display());
        return;
    }
    let runtime_dir = tempfile_runtime_dir();
    let mut session = MpvSession::start_with_executable(&runtime_dir, &sidecar)
        .await
        .expect("real packaged mpv must create IPC");
    assert!(endpoint_exists(session.endpoint_display()).await);
    session.stop().await.expect("stop real mpv");
}

#[tokio::test]
async fn creates_unique_private_ipc_and_cleans_it_after_stop() {
    let mut first = TestHarness::start().await;
    let mut second = TestHarness::start().await;
    assert_ne!(first.endpoint(), second.endpoint());
    assert!(first.endpoint_is_current_user_only().await);
    let endpoint = first.endpoint().to_owned();
    first.stop().await.expect("stop session");
    assert!(!endpoint_exists(&endpoint).await);
    second.stop().await.expect("stop second");
}

#[tokio::test]
async fn classifies_pre_start_load_rejection_as_playback_failed() {
    let mut harness = TestHarness::start_rejecting_load("network timeout").await;
    let error = harness.play(test_plan()).await.unwrap_err();
    assert_eq!(error.code(), "PlaybackFailed");
    assert!(error.message().contains("network timeout"));
}

#[tokio::test]
async fn emits_started_pause_seek_and_end_events() {
    let mut harness = TestHarness::start().await;
    harness.play(test_plan()).await.expect("play");
    assert_eq!(
        harness.next_event().await,
        NativePlayerEvent::Started {
            position_seconds: 0.0,
            duration_seconds: 120.0,
        }
    );
    harness.pause().await.expect("pause");
    harness.seek(30.0).await.expect("seek");
    assert!(matches!(
        harness.next_event().await,
        NativePlayerEvent::Paused { .. }
    ));
    assert!(matches!(
        harness.next_event().await,
        NativePlayerEvent::Seeked {
            position_seconds: 30.0,
            ..
        }
    ));
    harness.stop().await.expect("stop");
}
