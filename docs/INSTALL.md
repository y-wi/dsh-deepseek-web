# Install dsh-deepseek-web 1.1.1

Requires DeepSeek Harness **0.2.1-rc.2**, including Desktop, Web and TUI. Plugin 1.0.x targets the earlier 0.1 runtime. CLI installations need Node `^22.19.0 || >=24.0.0`; Desktop supplies its own runtime and package manager.

## Desktop / Web UI

1. Open **Plugins → Add plugin**.
2. Paste the tarball link below and select **Install**.
3. Select **Enable now** when installation finishes.
4. Open **Plugins → DeepSeek Web → Sign in with DeepSeek**. Complete sign-in on chat.deepseek.com in the dedicated browser window.

```text
https://github.com/y-wi/dsh-deepseek-web/releases/download/v1.1.1/dsh-deepseek-web-1.1.1.tgz
```

The `.tgz` installs the prebuilt plugin with its WASM. No Git clone, Rust compiler, local build or build-script approval is needed. Use the tarball link in the install field; the GitHub repository page contains the source workspace.

**Settings → DeepSeek Web** remains available. The sidebar footer lists DeepSeek Web conversations after sign-in. A finalized assistant message offers **Fork to Workspace**. `/clean [message]` toggles sending only the human text.

## Command line

```bash
dsh plugin --profile web add https://github.com/y-wi/dsh-deepseek-web/releases/download/v1.1.1/dsh-deepseek-web-1.1.1.tgz
dsh web
```

```bash
dsh plugin --profile tui add https://github.com/y-wi/dsh-deepseek-web/releases/download/v1.1.1/dsh-deepseek-web-1.1.1.tgz
dsh tui
```

Desktop owns its `desktop` profile. Use its Plugins page; do not initialize or launch that profile through another CLI profile.

## Update

In Plugins, remove the old plugin, install the new tarball URL, and select **Enable now**. Removal keeps saved credentials, isolated browser data and conversations. Avoid Sign out or clearing browser data when keeping your account session.

New imports use Harness session format 4. Existing sessions use Harness's normal migration handling. A workspace fork is independent of the original Web conversation.

## Verification

- Provider `deepseek-web` and models `default` / `expert` appear.
- Plugins → DeepSeek Web and Settings → DeepSeek Web both show account state.
- The sidebar conversation menu opens without client errors.
- Auth status and doctor return redacted public state only.

The running installation supplies DSH, Cordis and React. Model requests use your DeepSeek Web account. This unofficial integration does not bypass CAPTCHA, WAF or account access controls.
