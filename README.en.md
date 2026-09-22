# LumaRoute

English | [简体中文](./README.md)

> Multiple sources, original quality, direct playback.

LumaRoute is a cross-platform desktop client for Emby and Jellyfin. It focuses on managing multiple servers, switching between primary and backup routes, and playing original-quality media through a standalone mpv process.

## Project Status

LumaRoute is currently under **internal development**. Features and interfaces may change. This repository does not provide a public end-user release and is not offered under an open-source license.

## Highlights

- Manage multiple Emby / Jellyfin servers and access routes
- Browse and search media with essential item details
- Retry eligible failures through backup routes
- Direct play or remux-only direct stream through a standalone mpv process
- Synchronize playback state and progress with the server
- Store access credentials in the operating system's secure storage

## Tech Stack

- Tauri 2
- Vue 3 + TypeScript
- Rust
- pnpm workspace
- mpv

## Repository Structure

```text
apps/desktop       Desktop application and platform adapters
packages/core      Core business logic
packages/player    Player domain interfaces
tests              Integration and end-to-end tests
docs               Design, planning, and acceptance documents
```

## Local Development

You need Node.js 22.18+, pnpm 10.15, Rust, and the platform-specific [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
corepack enable
pnpm install
pnpm fetch:mpv
pnpm dev
```

Run the full quality gate:

```bash
pnpm check
```

## Disclaimer

LumaRoute does not provide, host, or sell media content. Users are responsible for ensuring that their servers, media sources, and usage comply with applicable laws and service terms.

## License

All rights reserved. No open-source license is currently granted. Copying, distribution, or commercial use is prohibited without authorization.
