# Browser auth

Browser login uses an isolated profile, CDP orchestration, strict origin
filtering (`https://chat.deepseek.com` only), credential validation, and
redaction.

The plugin does not read the default browser profile, does not capture
cross-site traffic, and does not return tokens to the frontend.
