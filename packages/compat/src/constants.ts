export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_UPLOAD_FILES = 20
export const UPLOAD_POLL_INTERVAL_MS = 500
export const UPLOAD_POLL_DEADLINE_MS = 180_000

export const ABSOLUTE_NONCE_LIMIT = 5_000_000
export const POW_DEADLINE_MS = 30_000
export const MAX_POW_WORKERS = 2

export const HTTP_CONNECT_TIMEOUT_MS = 30_000
export const HTTP_IDLE_TIMEOUT_MS = 180_000
export const MAX_JSON_BYTES = 256 * 1024
export const MAX_ERROR_BYTES = 64 * 1024
export const MAX_SSE_EVENT_BYTES = 2 * 1024 * 1024
export const MAX_SSE_TOTAL_BYTES = 64 * 1024 * 1024
export const MAX_TOKEN_BYTES = 32 * 1024
export const CREDENTIAL_REF = 'DEEPSEEK_WEB_TOKEN'
export const PLUGIN_ID = 'dsh-deepseek-web'
export const PROVIDER = 'deepseek-web'
