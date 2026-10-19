# dsh-deepseek-web

See the repository README for install, models, tools, and security boundaries.

This package is a DeepSeek Harness plugin. It uses DeepSeek Web through a
compatibility layer, is not the official Open Platform adapter, and does not
bypass CAPTCHA/WAF or account access controls.

After browser sign-in, the sidebar footer lists DeepSeek Web conversations. Fork
to Workspace creates an independent Harness session that does not write back to
the original Web conversation. Native search stays on for `default`. `/clean`
is a session toggle that sends only the human text.

Version 1.1.1 supports Harness 0.2.1-rc.2, including Desktop. In Plugins → Add plugin, paste:

```text
https://github.com/y-wi/dsh-deepseek-web/releases/download/v1.1.1/dsh-deepseek-web-1.1.1.tgz
```

Install, enable, then open Plugins → DeepSeek Web to sign in. The tarball includes the client and prebuilt WASM; installation needs no compiler.
