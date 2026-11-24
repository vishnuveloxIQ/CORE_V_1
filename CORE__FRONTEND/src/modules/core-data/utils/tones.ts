import type { StatusTone } from '@/shared/ui/Status'
import type { Availability, ProjectStatus, RequestStatus } from '../types'

export const REQUEST_TONE: Record<RequestStatus, StatusTone> = { Pending: 'pending', 'In review': 'review', 'Clarification requested': 'draft', Approved: 'approved', Rejected: 'rejected' }
export const PROJECT_TONE: Record<ProjectStatus, StatusTone> = { Planning: 'draft', Active: 'approved', 'On hold': 'pending', Completed: 'review' }
export const AVAIL_TONE: Record<Availability, StatusTone> = { Available: 'approved', 'In use': 'review', 'Under maintenance': 'pending', Breakdown: 'rejected' }

/** Stock position labels (Materials and Live Stock). */
export type StockLabel = 'In Stock' | 'Low Stock' | 'Available Stock' | 'Out of Stock' | 'Inactive'
export const STOCK_TONE: Record<StockLabel, StatusTone> = { 'In Stock': 'approved', 'Available Stock': 'approved', 'Low Stock': 'pending', 'Out of Stock': 'rejected', Inactive: 'draft' }

/** Procurement progress labels (Material Planning and purchase requests). */
export type ProcurementLabel = 'Requested' | 'Ordered' | 'Partially Received' | 'Received'
export const PROCUREMENT_TONE: Record<ProcurementLabel, StatusTone> = { Requested: 'pending', Ordered: 'review', 'Partially Received': 'review', Received: 'approved' }
