/**
 * Which login page the user signed in from ("Login as user" or "Login as admin"), kept for this tab. When the session
 * ends, the guard sends the user back to the same page instead of always to the admin login.
 */
export type LoginRole = 'admin' | 'user'

const KEY = 'veloxiq-core-login-role:v1'

export function rememberLoginRole(role: LoginRole): void {
  try {
    sessionStorage.setItem(KEY, role)
  } catch {
    /* blocked storage: the guard falls back to the admin login */
  }
}

/** The login page to return to: the one last used in this tab, or the admin login when none is known. */
export function lastLoginRole(): LoginRole {
  try {
    return sessionStorage.getItem(KEY) === 'user' ? 'user' : 'admin'
  } catch {
    return 'admin'
  }
}
