import { api } from '@/shared/lib/api'

/**
 * Device sessions, against GET /auth/sessions and DELETE /auth/sessions/{id}. The step-up calls live with the
 * step-up dialog (shared/lib/stepUp.tsx).
 */

export interface DeviceSession {
  id: string
  deviceLabel: string | null
  issuedAt: string
  expiresAt: string
  /** true for the device this screen is running on */
  current: boolean
}

export const listDeviceSessions = async () =>
  (await api<{ sessions: DeviceSession[] }>('GET', '/auth/sessions')).sessions

/** Signs one of the user's own devices out. The server answers 404 for a session that is not theirs. */
export const revokeDeviceSession = (id: string) =>
  api<{ revoked: boolean }>('DELETE', `/auth/sessions/${encodeURIComponent(id)}`)
