<div align="center">

# dsh-deepseek-web

**Connect DeepSeek Web to DeepSeek Harness**

[English](./README.en.md) · [中文](./README.md) · [Install](./INSTALL.md) · [npm](https://www.npmjs.com/package/dsh-deepseek-web)

[![npm](https://img.shields.io/npm/v/dsh-deepseek-web?color=1d4ed8&label=npm)](https://www.npmjs.com/package/dsh-deepseek-web)
[![release](https://img.shields.io/github/v/release/y-wi/dsh-deepseek-web?color=0f172a)](https://github.com/y-wi/dsh-deepseek-web/releases)
[![license](https://img.shields.io/github/license/y-wi/dsh-deepseek-web?color=334155)](./LICENSE)
[![node](https://img.shields.io/node/v/dsh-deepseek-web?color=1e293b)](https://nodejs.org)

<p>
  <img src="docs/assets/overview.png" alt="Architecture overview: browser login, DSH tool calls, session replay, and a prebuilt WASM core" width="920">
</p>
<p><sub>Open TypeScript integration layer plus a precompiled WASM protocol core. Login, tool execution, and policy stay in DeepSeek Harness.</sub></p>

</div>

---

Unofficial provider. This repository publishes the Harness **integration and transport** layer. Protocol compatibility ships as precompiled WebAssembly.

This project is **not affiliated with or endorsed by DeepSeek**. Users sign in with their own account. The plugin does not bypass CAPTCHA, WAF, or account controls; interactive challenges complete in an isolated browser window.

## Screenshots

### Session, reasoning, and tools

<p align="center">
  <img src="docs/assets/showcase-session.png" alt="DeepSeek Web session: DeepThink plans a directory listing, then DSH Glob runs" width="880">
</p>

<p align="center"><sub>
The user asks what is in the workspace. DeepThink is planning only; <code>Glob</code> is executed by DeepSeek Harness. The plugin translates model output into tool requests and <strong>never</strong> runs the filesystem itself.
</sub></p>

### Model and DeepThink

<p align="center">
  <img src="docs/assets/showcase-composer.png" alt="Composer: DeepSeek Web Expert with DeepThink reasoning" width="720">
</p>

<p align="center"><sub>
The composer switches <code>DeepSeek Web</code> / <code>DeepSeek Web Expert</code> and the DeepThink reasoning level. The footer reports turn timing and time-to-first-token.
</sub></p>

### Isolated browser login

<p align="center">
  <img src="docs/assets/showcase-settings.png" alt="Settings: isolated browser login, status, and diagnostics" width="880">
</p>

<p align="center"><sub>
Settings signs in to <code>chat.deepseek.com</code> with a dedicated browser profile, not everyday Chrome or Edge. Status, reconnect, logout, and PoW diagnostics live here. Credentials stay in DSH storage.
</sub></p>

## Capabilities

| Capability | Detail |
| --- | --- |
| Browser login | Isolated `--user-data-dir`; never the everyday browser profile |
| Native DSH tools | Text tool bridge → `ToolCallBlock`; FS / Shell / MCP / approval run in Harness |
| Session replay | Continue a DSH session and rebuild remote context |
| Prebuilt WASM | No Rust / wasm-pack on install; tokens and cookies **never enter** WASM |

## Architecture

| Layer | Responsibility |
| --- | --- |
| Open TypeScript layer | HTTP, SSE, browser login, credentials, DSH adapter, tool bridge, replay |
| Precompiled WASM core | Protocol compatibility and PoW |

DeepSeek Web has no official function calling. The plugin only parses model output. The adapter **never** executes shell, filesystem, or MCP.

## Install

Requires DeepSeek Harness **0.1.0-rc.7** (or compatible) and Node `^22.19.0 || >=24.0.0`.

```bash
dsh plugin --profile web add dsh-deepseek-web
dsh plugin --profile web peers check
dsh web
```

Settings → DeepSeek Web → Sign in with DeepSeek. Confirm provider `deepseek-web` and models `default` / `expert`.

DSH / Cordis / React come from `$DSH_HOME/profiles/node_modules`. They are not duplicated under the plugin package.

<details>
<summary>TUI, CLI, and updates</summary>

```bash
dsh plugin --profile dsh-tui add dsh-deepseek-web
dsh-tui
```

```bash
dsh plugin --profile web exec dsh-deepseek-web status
dsh plugin --profile web exec dsh-deepseek-web login
dsh plugin --profile web update dsh-deepseek-web
```

Headless fallback (not a substitute for browser login):

```bash
dsh plugin --profile web exec dsh-deepseek-web login --token-stdin
```

See [INSTALL.md](./INSTALL.md) for the full notes.

</details>

## Models

| ID | Description |
| --- | --- |
| `deepseek-web/default` | DeepSeek Web |
| `deepseek-web/expert` | DeepSeek Web Expert |

Thinking is `on` / `off`. Native web search is off by default. Input modalities are **text-only**.

## Safety

- Never print `.credentials.yaml`, Bearer tokens, CDP endpoints, or absolute browser profile paths
- Login uses only the plugin-owned isolated profile
- Credentials are stored only in DSH

See [SECURITY.md](./SECURITY.md) and [docs/browser-auth.md](./docs/browser-auth.md).

## Docs

- [Install](./INSTALL.md)
- [Contributing](./CONTRIBUTING.md)
- [Releases](https://github.com/y-wi/dsh-deepseek-web/releases)
- [中文 README](./README.md)

## License

MIT for the TypeScript integration layer. See [LICENSE](./LICENSE) and [LICENSES/PROTOCOL_CORE.txt](./LICENSES/PROTOCOL_CORE.txt) for the precompiled core. Notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
