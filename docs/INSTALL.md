# Install dsh-deepseek-web

Requires DeepSeek Harness **0.1.0-rc.7** (or compatible), Node `^22.19.0 || >=24.0.0`.

## Web profile

```bash
dsh plugin --profile web add dsh-deepseek-web
dsh web
```

Open Settings → DeepSeek Web → Sign in with DeepSeek. A dedicated browser window
opens. After you log in on chat.deepseek.com, the plugin stores the credential
in DSH.

Check:

- provider `deepseek-web` is listed
- models `default` and `expert` are visible
- auth status returns public state only (no token)

## TUI

```bash
dsh plugin --profile dsh-tui add dsh-deepseek-web
dsh-tui
```

## CLI

```bash
dsh plugin --profile web exec dsh-deepseek-web status
dsh plugin --profile web exec dsh-deepseek-web login
```

Headless fallback (not a substitute for browser login):

```bash
dsh plugin --profile web exec dsh-deepseek-web login --token-stdin
```

Unofficial integration. Users are responsible for complying with applicable
upstream terms.
