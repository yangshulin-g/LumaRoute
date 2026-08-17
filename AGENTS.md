# LumaRoute Agent 入口

本文件是所有 Agent 的首要入口，只保存导航与长期护栏，不复制详细设计。

## 开始编码前

必须依次阅读：

1. 已批准设计：`docs/superpowers/specs/2026-08-07-lumaroute-v0.1-design.md`
2. 当前计划：`docs/superpowers/plans/2026-08-07-lumaroute-v0.1-implementation.md`
3. 与将修改文件匹配的 `.cursor/rules/*.mdc`

## 产品与范围

LumaRoute（光路）是跨平台 Emby/Jellyfin 桌面客户端，目标是可靠管理多台逻辑服务器及其主备线路，并通过独立 mpv 进程原画直放。

v0.1 只完成已批准设计中的登录、服务器与线路管理、浏览/搜索/最小详情、直放/直接串流、进度上报、本地安全存储和三平台构建闭环。

v0.1 不做跨服聚合与跨源匹配、播放中无感切线、视频转码、增强播放、更多来源、下载、自动更新或商业化。完整边界以已批准设计第 4 节为准。

## 架构护栏

- `apps/desktop`：Vue 交互、状态、组合根与 Tauri 平台适配。
- `packages/core`：不依赖 Vue、Pinia、Tauri 或具体数据库的纯 TypeScript 业务核心。
- `packages/player`：稳定的 `PlayerEngine`、播放计划与事件类型。
- `apps/desktop/src-tauri`：保持最薄，只承接进程、受限 IPC、安全凭证和系统能力。
- 页面只调用应用服务，不直接解析服务端 DTO，也不直接访问 SQLite、凭证或 mpv IPC。

`ServerProfile` 是真实 Emby/Jellyfin 实例加用户身份；`ServerLine` 是访问同一实例的一个 URL。备用线路只有在 `ServerId` 一致时才能归入同一 Profile。

## 安全与验证

- 密码认证后立即丢弃；Token 仅存系统安全存储，禁止进入 SQLite、URL、命令行、普通配置、测试夹具或日志。
- HTTP 仅访问用户明确配置的线路，拒绝意外跨域重定向，不提供忽略 TLS 错误。
- mpv 使用随机 IPC 地址和当前用户权限；敏感请求头经 IPC 注入。
- 所有行为变更先写失败测试，确认红灯，再做最小实现并确认绿灯。
- 完成任务前运行该任务指定测试、全量质量门和 `git diff --check`；不得以人工点击替代自动化验证。

## 事实来源与记忆维护

优先级为：已批准 spec（产品/架构约束）→ 当前 plan（顺序/接口/验收）→ 测试与代码（已实现事实）→ 本文件与 Cursor rules（导航/护栏）。

若实现需要改变产品范围或架构，先修订 spec 并重新获得批准，再同步 plan。若只改变执行细节，更新 plan、测试和相关代码。本文件仅在入口、长期边界或事实来源变化时更新；规则只保存对应文件类型的稳定约束，避免四处复制。

已知暂缓问题见 `docs/known-issues.md`（含开发态 macOS 钥匙串反复授权弹窗）。
