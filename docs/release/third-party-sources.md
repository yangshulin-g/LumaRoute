# LumaRoute v0.1 Third-Party Runtime Sources

The machine-readable source URL, exact version, target, and SHA-256 for every
bundled mpv build are recorded in
`apps/desktop/src-tauri/resources/mpv/mpv.lock.json`.

Each package includes the unmodified mpv and FFmpeg license texts under
`resources/third-party/`. The package workflow verifies that every manifest
license entry exists before creating an installer.

## Qualification notes

- `aarch64-apple-darwin` was fully qualified on a native Apple Silicon host
  (executable version, JSON IPC, H.264/H.265/AV1 software decode, header
  leakage checks, license binding, SHA-256).
- Windows x64, macOS Intel, and Linux x64 entries are **archive-sealed** with
  measured SHA-256 digests of versioned upstream artifacts. Native runners in
  `.github/workflows/package.yml` must run `verify-mpv.mjs qualify` before
  treating those targets as fully release-qualified.

## Sample fixtures

Controlled H.264 / H.265 / AV1 clips used by mpv qualification live under
`tests/fixtures/media/samples/` and are locked by
`tests/fixtures/media/samples.lock.json` (`lumaroute-fixture://` URLs, CC0-1.0).
