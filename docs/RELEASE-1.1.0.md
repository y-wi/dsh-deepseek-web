# 1.1.0 — Harness 0.2 compatibility

Targets DeepSeek Harness 0.2.1-rc.2, including the Desktop plugin installation flow.

- Paste the release `.tgz` URL into **Plugins → Add plugin**, install, then enable it. The package includes compiled JavaScript and WASM.
- Configure sign-in directly from **Plugins → DeepSeek Web**. The Settings entry remains available.
- Use the current Cordis client context, Session and Workspace controllers, workspace navigation, and renamed host icons.
- Import Web conversations through format 4 persistence handles. Forks use Harness's own inherited seed construction and remain reusable after restart.
- Preserve full tool-result content, call identity and error state in the current tool-role message format. Keep developer context separate from user text.
- Supply English and Chinese plugin display metadata.

For the older Harness 0.1 runtime, keep plugin 1.0.x. When updating through the UI, remove the old plugin, install the new URL and enable it; saved credentials and conversations remain on disk.

Validation on Windows: Rust protocol tests, TypeScript tests and build, real 0.2.1-rc.2 JSONL import/append/fork/replay, a two-round tool exchange, a fresh-profile packed install, and the running host's Plugins page, sidebar and diagnostics. Browser checks used the official Web host at desktop and narrow widths. A packaged Electron Desktop application and a live authenticated DeepSeek completion were not exercised in this environment.
