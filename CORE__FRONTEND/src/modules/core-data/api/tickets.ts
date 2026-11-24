import { api } from '@/shared/lib/api'
import type { Ticket } from '../types'

/** /tickets. Anyone raises a ticket; changing status or priority needs records.manage. */

export type TicketPriorityApi = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatusApi = 'open' | 'in_progress' | 'resolved' | 'closed'
export interface TicketRecord {
  id: string; code: string; subject: string; category: string; priority: TicketPriorityApi | null; description: string | null
  status: TicketStatusApi; raisedByUserId: string | null; createdAt?: string; rowVersion: number
}

const PRIORITY_FROM: Record<TicketPriorityApi, Ticket['priority']> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'High' }
const STATUS_FROM: Record<TicketStatusApi, Ticket['status']> = { open: 'Open', in_progress: 'Answered', resolved: 'Closed', closed: 'Closed' }
export const toApiPriority = (p: Ticket['priority']): TicketPriorityApi => p.toLowerCase() as TicketPriorityApi
export const toApiStatus = (s: Ticket['status']): TicketStatusApi => (s === 'Open' ? 'open' : s === 'Answered' ? 'in_progress' : 'closed')

export const ticketFrom = (r: TicketRecord): Ticket => ({
  id: r.id, code: r.code, subject: r.subject, category: r.category, priority: PRIORITY_FROM[r.priority ?? 'medium'],
  description: r.description ?? '', status: STATUS_FROM[r.status], createdAt: r.createdAt ?? '', raisedById: r.raisedByUserId ?? '', rowVersion: r.rowVersion,
})

export const listTickets = () => api<TicketRecord[]>('GET', '/tickets')
export const getTicket = (id: string) => api<TicketRecord>('GET', `/tickets/${encodeURIComponent(id)}`)
/** The server sets the raiser. Priority is not in the create body (only records.manage sets it afterwards). */
export const createTicket = (body: { code: string; subject: string; category: string; description?: string }, idempotencyKey?: string) =>
  api<TicketRecord>('POST', '/tickets', { body, idempotencyKey })
export const updateTicket = (id: string, rowVersion: number, body: { subject?: string; category?: string; description?: string; priority?: TicketPriorityApi; status?: TicketStatusApi }, idempotencyKey?: string) =>
  api<TicketRecord>('PATCH', `/tickets/${encodeURIComponent(id)}`, { body: { ...body, rowVersion }, idempotencyKey })
