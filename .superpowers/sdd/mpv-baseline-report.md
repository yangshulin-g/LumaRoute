# mpv 基线失败调查报告

## 范围与结论

- 工作区：`/Users/yangshulin/my_code/LumaRoute-next-stage`
- 分支：`feature/lumaroute-next-stage`
- 范围：仅诊断并修复 v0.1 Internal Alpha 的 macOS 打包 mpv IPC 启动基线；未修改 v0.2、UI 或三份 spec/plan。
- 根因：固定的 macOS 上游归档是完整 `mpv.app`。现有 `fetch-mpv.mjs` 将 `Contents/MacOS/mpv` 抽成 Tauri standalone sidecar，却没有重新签名。主二进制原签名依赖 App Bundle 的 `Contents/Info.plist`，脱离 Bundle 后变成无效签名；macOS `amfid` 首次执行时重新评估主二进制和大量动态库，冷启动约 36.7 秒，超过 `MpvSession` 等待 IPC 的 5 秒。参数、Unix socket 长度/权限、CPU 架构和动态库缺失均不是根因。
- 修复：macOS sidecar 及依赖复制完成后，对 standalone 主二进制执行本机 ad-hoc `codesign --force --sign -`。归档 SHA-256 仍在提取前验证；修复只重签打包布局中的副本。

## 调查过程与证据

### 1. 基线与约束

已阅读：

- `AGENTS.md`
- `docs/superpowers/specs/2026-08-07-lumaroute-v0.1-design.md`
- `docs/superpowers/plans/2026-08-07-lumaroute-v0.1-implementation.md` 中 Task 8、Task 13
- `docs/superpowers/specs/2026-08-21-lumaroute-v0.1-internal-alpha-design.md`
- `.cursor/rules/rust-boundary.mdc`
- `process.rs`、`session.rs`、`protocol.rs`、`tests/mpv_session.rs`
- `scripts/fetch-mpv.mjs`、`scripts/verify-mpv.mjs`、`mpv.lock.json`

分支初始状态干净，HEAD 为 `2a8f5d8`。

### 2. 稳定复现

执行：

```bash
pnpm fetch:mpv
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --test mpv_session \
  real_packaged_mpv_creates_ipc_socket_when_available \
  -- --nocapture
```

首次结果：失败，5.02 秒后返回 `PlayerUnavailable("等待播放器 IPC 套接字超时……")`。进程未在 5 秒内退出，因此现有 early-exit stderr 路径没有捕获到异常。

### 3. 进程、参数、架构、权限与动态库

- `file` / `lipo -info`：sidecar 是匹配主机的 Mach-O arm64。
- `ls -lO@`：权限为 `0755`，无 `com.apple.quarantine`；只有 `com.apple.provenance`。
- 启动参数由测试和代码确认使用单一 equals 形式：`--input-ipc-server=/tmp/...sock`。
- 测试 runtime 路径保持短路径，目录权限 `0700`；fake mpv 能创建并保护 socket。
- `otool -L` / `dyld_info -dependents`：依赖使用 `@executable_path/lib/...`，所需 companion dylib 已复制；`mpv --version` 最终成功，排除缺库和架构错误。
- 代表性依赖 `libavcodec.62.dylib` 通过 `codesign --verify --strict`。

### 4. 冷启动与系统安全证据

首次直接执行：

```bash
/usr/bin/time -p apps/desktop/src-tauri/resources/bin/mpv-aarch64-apple-darwin --version
```

耗时约 36.69 秒；同一文件后续执行约 0.16 秒，聚焦 IPC 测试随后约 0.22 秒通过。这说明失败发生于首次冷启动评估，而不是 IPC 协议。

修复前：

```bash
codesign --verify --deep --strict --verbose=4 \
  apps/desktop/src-tauri/resources/bin/mpv-aarch64-apple-darwin
```

结果：

```text
invalid Info.plist (plist or signature have been modified)
```

`spctl --assess` 同样因无效资源/签名拒绝。统一日志在失败时记录：

```text
amfid ... mpv-aarch64-apple-darwin not valid:
AppleMobileFileIntegrityError Code=-420 "The signature on the file is invalid"
```

并连续记录大量 `Contents/MacOS/lib/*.dylib` 的评估。时间跨度覆盖 5 秒超时并持续到约 36 秒。

归档结构检查显示：

```text
mpv.app/Contents/Info.plist
mpv.app/Contents/MacOS/mpv
mpv.app/Contents/MacOS/lib
```

直接从固定归档解出完整 `mpv.app` 后，`codesign --verify --deep --strict mpv.app` 以及 Bundle 内的 `Contents/MacOS/mpv` 均通过。只有将主二进制抽离 App Bundle 后签名失效，确认了根因边界。

## TDD 与改动

### RED

先在 `apps/desktop/src-tauri/tests/mpv_session.rs` 增加 macOS 专用回归测试：

```text
packaged_mpv_has_a_valid_standalone_signature_when_available
```

修复前测试稳定失败，错误为 `invalid Info.plist`。

### GREEN

修改 `scripts/fetch-mpv.mjs`：

- Apple Darwin target 复制 standalone sidecar 和 companion runtime 后，执行：
  `codesign --force --sign - <sidecar>`
- 未改变 Windows/Linux 流程。
- 未改变 mpv 启动参数、IPC 协议、超时或产品行为。

修复后：

- 新签名测试通过。
- 原始真实 mpv IPC 聚焦测试通过，约 1.55 秒完成。
- `codesign --verify --strict --verbose=4` 返回 `valid on disk` 与 `satisfies its Designated Requirement`。

## 验证命令与结果

通过：

```bash
pnpm fetch:mpv
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --test mpv_session \
  packaged_mpv_has_a_valid_standalone_signature_when_available \
  -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --test mpv_session \
  real_packaged_mpv_creates_ipc_socket_when_available \
  -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
node --test scripts/verify-mpv.test.mjs
pnpm check:mpv
git diff --check
```

结果摘要：

- 聚焦签名测试：1/1 通过。
- 聚焦真实 IPC 测试：1/1 通过。
- Rust 全量：25 个单元测试、2 个 capability、1 个 credential、4 个 mpv session，共 32/32 通过。
- TS/Vue：42 个文件、145/145 通过。
- lint、typecheck、boundary check、mpv manifest check 均通过。

`pnpm check` 未完整通过，失败点与本修复无关：

```text
ENOENT: no such file or directory, open 'tests/fixtures/security/app.log'
```

该路径没有版本控制文件，且被仓库 `.gitignore` 的 `*.log` 规则忽略；质量门在敏感输出扫描阶段停止。停止前 lint、typecheck、145 个 TS 测试、Rust 全量和 boundary check 全部通过；停止后的 `pnpm check:mpv` 已单独补跑通过。未擅自新增或修改这个范围外的安全夹具。

## 自审与剩余关注

- 修复针对已证实的单一根因，没有以放宽 5 秒 IPC 超时掩盖无效签名。
- ad-hoc 签名符合当前“未签名 Internal Alpha”的范围，只修复本地代码完整性；`spctl --assess` 仍会拒绝没有 Developer ID/公证的 standalone sidecar，这是 spec 已明确的公开分发门禁，不影响当前内部 Alpha IPC 测试。
- 当前回归测试在 sidecar 不存在时与既有真实 mpv 测试一致地跳过；package/fetch 流程必须先执行 `pnpm fetch:mpv` 才能实际覆盖。
- `pnpm check` 仍被缺失且被忽略的 `tests/fixtures/security/app.log` 阻塞，需要在独立范围修正夹具跟踪策略或质量门输入。
