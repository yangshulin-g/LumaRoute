# LumaRoute 服务器管理补完与 UI 修正设计

- 日期：2026-09-23
- 状态：待审阅
- 基线：`2026-08-07-lumaroute-v0.1-design.md`（§7.3、§9.1、§9.4）与 `2026-08-21-lumaroute-ui-interaction-design.md`
- 前置：UI/UX Interaction 计划已在 `feature/lumaroute-next-stage` 完成

## 1. 目标

本阶段不扩大 v0.1 产品范围，只补齐 v0.1 spec 已要求但未实现的能力，并修正实机验收发现的 UI 问题：

1. 主界面内可添加服务器（v0.1 §9.4「添加、编辑、删除和排序服务器」）。
2. 凭证失效或服务端改密码后可重新登录（v0.1 §7.3「Token 失效时要求用户重新登录」）。
3. 搜索只保留顶栏一个输入框。
4. 线路默认名称中文化，可命名、可重命名；首页不重复展示线路。
5. 无服务器时回到引导页，不再渲染占位服务器。

## 2. 非目标

- 不在客户端修改服务端密码；只在服务端改密后重新登录。
- 重新登录不允许更换用户名或用户；不同用户按新服务器添加。
- 不做首页数据增强（最新入库、媒体库封面、Backdrop、推荐），留给后续独立设计（UI 计划 Deferred Work Package A）。
- 不改线路选择、故障转移、播放、进度上报、mpv 或 Rust 层。

## 3. 搜索（A1）

- 顶栏 `current-server-search` 是唯一搜索输入；`⌘K/Ctrl+K` 行为不变。
- `SearchView` 删除自身输入框和「当前线路」行，仅从 `route.query.q` 读取关键词。
- 有关键词：标题「搜索「{q}」· {N} 条（当前服务器）」+ 结果或零结果空态（保留现有空态文案与 testid）。
- 无关键词：空态「在顶部搜索框输入关键词（⌘K / Ctrl+K）」。
- 250ms 防抖、分页、切服取消与结果仅限当前服务器的行为保持不变。

## 4. 线路命名与首页去重（A2、A3）

- `LoginService.addServer` 新增可选输入 `lineLabel`；去空白后为空时使用「主线路」，不再写入英文 `Primary`。
- 引导页新增可选字段「线路名称」，占位「主线路」。
- 设置页线路卡新增「重命名」：通过现有 `updateLines` 更新 `label`；去空白后为空则拒绝保存并提示；不改变 `id/baseUrl/priority/enabled`。
- 已存在的 `Primary` 数据不自动迁移，由用户重命名。
- 首页删除「当前连接」卡片（顶栏 HUD 已显示线路与状态），继续观看占满首行；首页不再出现 `active-line`。

## 5. 无服务器状态（A4）

- `serverStore.profiles` 为空时，访问 Shell 内任意路由都重定向到 `/onboarding`。
- 删除最后一台服务器后跳转 `/onboarding`。
- `settingsProps()` 不再构造 `id: 'missing'` 占位 Profile；设置页只在存在真实 Profile 时渲染。

## 6. 添加服务器（B1）

- 入口：侧栏「服务器」标题旁 `+`（`data-testid="add-server"`，`aria-label="添加服务器"`）；设置页「添加服务器」按钮。
- 两个入口均进入 `/onboarding?mode=add`。
- 添加模式下显示「取消」，返回进入前的页面；首次启动（无服务器）不显示取消。
- 成功后：保存 Profile → 设为当前服务器 → 进入首页。
- 登录、ServerId 获取、密码丢弃、Token 写入钥匙串的规则与现有首次添加完全相同。

## 7. 重新登录（B2）

### 7.1 Core

新增：

```ts
// packages/core/src/auth/login-service.ts
export interface ReauthenticateInput {
  profileId: string
  password: string
  deviceId: string
  appVersion: string
}

reauthenticate(input: ReauthenticateInput): Promise<ServerProfile>
```

规则：

1. 读取 Profile；不存在则 `StorageFailure`。
2. 使用 Profile 的 `username`；用户名不可由调用方修改。
3. 复用 `orderLines` 与 `canFailOver`（`packages/core/src/server/`）逐条认证：`NetworkUnavailable`、`LineTimeout`、`502/503/504` 时尝试下一条；其他错误（含 `401/403` → `AuthenticationExpired`）立即失败，不通过换线掩盖。不写入线路粘滞状态。
4. 认证成功后必须满足 `session.serverId === profile.serverId` 且 `session.userId === profile.userId`；ServerId 不同抛出现有 `ServerMismatch`，UserId 不同抛出新增 `UserMismatch`；两者都不写入凭证。
5. 通过校验后经 `CredentialStore.set` 以同一 `credentialKey` 覆盖 Token。Rust 侧 `CachedCredentialStore.set` 为写穿缓存，新 Token 立即生效，无需改 Rust。密码不保存、不进入日志或错误。
6. 返回 Profile（内容不变）。

`AppErrorCode` 新增 `UserMismatch`，中文提示「该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。」，并纳入集中错误映射与脱敏。这是 core 错误码的增量扩展，不改变既有错误码语义。

### 7.2 桌面端

- `serverStore.reauthenticate(profileId, password)` 调用 core，成功后清除该服务器的连接错误状态并重新加载首页数据。
- 设置页新增「账号」区块：显示用户名（只读）与「重新登录」按钮；展开后为密码输入 + 「登录」+ 「取消」。提交后清空密码字段；成功显示「已重新登录」，失败显示映射后的中文错误。
- 凭证失效（`AuthenticationExpired`）时，首页错误态与侧栏服务器状态提供「重新登录」动作，跳转设置页账号区块。

## 8. 安全

- 密码只存在于提交期间的组件局部状态与认证调用参数中，提交后立即清空。
- Token 只进入系统安全存储；不进入 SQLite、URL、日志、测试夹具或快照。
- 仅访问 Profile 已配置的线路；不接受新的 URL。

## 9. 测试

- Core：`reauthenticate` 成功覆盖 Token；ServerId 不一致（`ServerMismatch`）、UserId 不一致（`UserMismatch`）不写凭证；`401` 不换线；超时换线；禁用线路不尝试；密码不出现在错误信息中；`addServer` 默认线路名「主线路」与自定义名。
- 桌面单测：搜索页无输入框且读取 `q`；首页无「当前连接」；无服务器重定向；删除最后一台服务器跳转引导页；添加模式取消返回；侧栏 `+` 入口；线路重命名；账号区块成功/失败与密码清空。
- E2E：从侧栏添加第二台服务器并切换；重新登录流程（模拟服务器接受新密码）；顶栏是唯一搜索框。
- 质量门：`pnpm check`、`pnpm exec playwright test`、`git diff --check`。

## 10. 验收

1. 页面上只有一个搜索输入框。
2. 新添加服务器的线路默认名为「主线路」，可重命名。
3. 首页不重复显示线路。
4. 无服务器时不出现占位服务器或未处理异常。
5. 主界面可添加第二台服务器且无需重启。
6. 改密后可在设置页重新登录；账号不一致时拒绝并给出明确指引。
7. 全量质量门与 E2E 通过。
