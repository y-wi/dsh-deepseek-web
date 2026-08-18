# Security policy

Report credential leaks privately to the repository owner. Prefer GitHub
private vulnerability reporting when it is available.

This plugin authenticates with the user's own DeepSeek account. It does not
bypass CAPTCHA, WAF, or account access controls. It never reads the user's
default browser profile.

Do not paste into issues, fixtures, or logs:

- Bearer tokens
- cookies
- Authorization headers
- raw browser profiles

Tests use the documented literal `Bearer TEST_ONLY_TOKEN`.
