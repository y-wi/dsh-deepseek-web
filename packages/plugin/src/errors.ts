import { ERROR_CODES } from '@dsh-deepseek-web/compat'

export { ERROR_CODES }

export function asLlmCode(code: string): string {
  if (code === ERROR_CODES.REAUTH_REQUIRED) return 'AUTH'
  if (code === ERROR_CODES.RATE_LIMIT) return 'RATE_LIMIT'
  if (code === ERROR_CODES.TIMEOUT) return 'TIMEOUT'
  if (code === ERROR_CODES.MISSING_CREDENTIAL) return 'MISSING_CREDENTIAL'
  return code
}
