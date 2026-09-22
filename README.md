# LumaRoute（光路）

[English](./README.en.md) | 简体中文

> 多源汇聚，原画直达。

LumaRoute 是一款面向 Emby 与 Jellyfin 的跨平台桌面客户端，专注于多服务器管理、主备线路切换和通过独立 mpv 进程进行原画播放。

## 项目状态

LumaRoute 目前处于**内部开发阶段**，功能和接口仍可能调整。当前仓库不提供面向普通用户的公开发行版，也未授予开源许可。

## 主要能力

- 管理多台 Emby / Jellyfin 服务器及其访问线路
- 浏览、搜索媒体并查看基础详情
- 在线路故障时按规则尝试备用线路
- 使用独立 mpv 进程进行直放或无转码直接串流
- 向服务端同步播放状态和进度
- 使用系统安全存储保存访问凭证

## 技术栈

- Tauri 2
- Vue 3 + TypeScript
- Rust
- pnpm workspace
- mpv

## 仓库结构

```text
apps/desktop       桌面应用与平台适配
packages/core      业务核心
packages/player    播放器领域接口
tests              集成与端到端测试
docs               设计、计划与验收文档
```

## 本地开发

需要 Node.js 22.18+、pnpm 10.15、Rust，以及对应平台的 [Tauri 2 前置依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
corepack enable
pnpm install
pnpm fetch:mpv
pnpm dev
```

运行完整质量检查：

```bash
pnpm check
```

## 说明

LumaRoute 不提供、托管或销售任何媒体内容。使用者应确保其服务器、媒体来源及使用方式符合适用法律和服务条款。

## 许可

版权所有。当前项目未开放源代码许可，未经授权不得复制、分发或用于商业用途。
