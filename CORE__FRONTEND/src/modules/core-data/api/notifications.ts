import { api } from '@/shared/lib/api'

/** /notifications: the list and single read are limited to the signed-in recipient. Creating one needs records.manage. */

export interface NotificationRecord {
  id: string; recipientUserId: string; notificationType: string; sourceType: string | null; sourceId: string | null
  title: string; body: string | null; deliveryStatus: 'pending' | 'sent' | 'failed'; readAt: string | null; createdAt?: string; rowVersion: number
}

export const listNotifications = () => api<NotificationRecord[]>('GET', '/notifications')
export const getNotification = (id: string) => api<NotificationRecord>('GET', `/notifications/${encodeURIComponent(id)}`)
export const markNotificationRead = (id: string, idempotencyKey?: string) =>
  api<NotificationRecord>('POST', `/notifications/${encodeURIComponent(id)}/read`, { idempotencyKey })
export const createNotification = (body: { recipientUserId: string; notificationType: string; sourceType?: string; sourceId?: string; title: string; body?: string }, idempotencyKey?: string) =>
  api<NotificationRecord>('POST', '/notifications', { body, idempotencyKey })
