export const STATUS_PATH = '/plugins/dsh-deepseek-web/auth/status'
export const LOGIN_PATH = '/plugins/dsh-deepseek-web/auth/login'
export const CANCEL_PATH = '/plugins/dsh-deepseek-web/auth/cancel'
export const LOGOUT_PATH = '/plugins/dsh-deepseek-web/auth/logout'
export const DOCTOR_PATH = '/plugins/dsh-deepseek-web/doctor'

export async function pluginFetch(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers)
  if (!headers.has('accept')) headers.set('accept', 'application/json')
  if (init?.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers })
  const text = await response.text()
  let body: unknown = null
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      throw new Error(`DeepSeek Web ${path} returned ${response.status}`)
    }
  }
  if (!response.ok) {
    const error = (body as { error?: string } | null)?.error
    throw new Error(error ?? `DeepSeek Web ${path} returned ${response.status}`)
  }
  return body
}
