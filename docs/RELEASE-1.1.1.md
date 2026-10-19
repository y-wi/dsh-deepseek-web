# 1.1.1 — Tool-call reliability

Fixes parsing and continuation failures reproduced with an authenticated DeepSeek Web account on Harness 0.2.1-rc.2.

- Preserve literal tool tags, escaped quotes, Windows paths, and newlines inside JSON arguments such as file contents.
- Recognize DSML's ASCII and fullwidth pipe variants, including spaced double-pipe tags. Preserve parameters explicitly marked as strings.
- Validate complete call batches before returning tools. Repair malformed calls after a visible preamble instead of silently finishing.
- Keep completed answers ahead of protocol examples and drafts quoted in thinking.
- Return original tool names, arguments, call identities, result content, and errors on continuing and rebuilt conversations.
- Surface upstream rate-limit hints and empty responses as errors instead of blank successful replies.

Install by pasting this URL into **Plugins → Add plugin**, then enable the plugin:

```text
https://github.com/y-wi/dsh-deepseek-web/releases/download/v1.1.1/dsh-deepseek-web-1.1.1.tgz
```

When updating through the UI, remove the previous plugin before installing this URL. Saved credentials and conversations remain on disk.
