# dsh-deepseek-web

[English](./README.md) · [中文](./README.zh.md)

<p align="center">
  <img src="docs/assets/overview.png" alt="dsh-deepseek-web: connect DeepSeek Web to DeepSeek Harness" width="100%">
</p>

An unofficial DeepSeek Web provider for DeepSeek Harness.

This repository contains the open DeepSeek Harness integration and transport
layer. Provider protocol compatibility is supplied by a precompiled WebAssembly
component distributed with the package.

This project is not affiliated with or endorsed by DeepSeek.

The DSH integration and transport layer are open source.
The protocol compatibility core is distributed as precompiled WebAssembly.

Users authenticate with their own DeepSeek account. The plugin does not bypass
CAPTCHA, WAF, or account access controls. Interactive challenges are completed
in the user's real browser.

## Install

```bash
dsh plugin --profile web add dsh-deepseek-web
dsh plugin --profile web peers check
dsh web
```

Then: Settings → DeepSeek Web → Sign in with DeepSeek.

See [INSTALL.md](./INSTALL.md) for TUI, CLI, and safety notes.

## Models

- `deepseek-web/default` — DeepSeek Web
- `deepseek-web/expert` — DeepSeek Web Expert

Thinking is `on` / `off`. Native search is off by default.
Input modalities are text-only.

## Tools

DeepSeek Web has no native function calling. The plugin translates Harness
`ToolSchema` into a textual contract and emits `ToolCallBlock`s. DeepSeek
Harness executes FS, Shell, MCP, approval, and scheduling. The adapter never
runs those tools.

## License

MIT for the TypeScript integration layer. See [LICENSE](./LICENSE) and
[LICENSES/PROTOCOL_CORE.txt](./LICENSES/PROTOCOL_CORE.txt) for the precompiled
core. Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
