/**
 * Auth helpers.
 *
 * The JWT is stored in sessionStorage — this survives page refreshes but is
 * automatically cleared when the user closes the tab or window, enforcing
 * "login again on close" behaviour without any server-side session management.
 */

const TOKEN_KEY = 'ra_access_token'
const USER_KEY  = 'ra_user'

export function saveSession(token: string, user: object): void {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): object | null {
  const raw = sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

export function isLoggedIn(): boolean {
  return Boolean(getToken())
}

/** Decode JWT exp claim client-side and check if it's expired (with 60s buffer). */
export function isTokenExpired(): boolean {
  const token = getToken()
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Date.now() / 1000 >= (payload.exp as number) - 60
  } catch {
    return true
  }
}
