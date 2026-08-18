const PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._\-+=/]+/gi, 'Bearer [redacted]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted jwt]'],
  [/(\bauthorization=)[^&\s]+/gi, '$1[redacted]'],
  [/(\baccess_token=)[^&\s]+/gi, '$1[redacted]'],
  [/(\brefresh_token=)[^&\s]+/gi, '$1[redacted]'],
  [/(\btoken=)[^&\s]+/gi, '$1[redacted]'],
  [/(\bcookie=)[^&\s]+/gi, '$1[redacted]'],
  [/\bCookie:\s*[^\r\n]+/gi, 'Cookie: [redacted]'],
  [/\bAuthorization:\s*[^\r\n]+/gi, 'Authorization: [redacted]'],
]

export function redactSensitiveText(value: string): string {
  let out = value
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

export function isTestOnlyToken(value: string): boolean {
  return value.includes('TEST_ONLY_TOKEN')
}
