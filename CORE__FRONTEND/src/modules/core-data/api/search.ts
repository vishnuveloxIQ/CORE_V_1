import { api } from '@/shared/lib/api'

/** GET /search (API 1.6.0): master records by code or name in the signed-in company, fresh from the server. */
export type SearchType = 'project' | 'location' | 'store' | 'material' | 'vendor' | 'equipment'
export interface SearchHit { type: SearchType; id: string; code: string | null; label: string; rank: number }

export const searchRecords = (q: string, limit = 5) =>
  api<SearchHit[]>('GET', `/search?q=${encodeURIComponent(q)}&limit=${limit}`)

/** Where a hit opens. Records without a page of their own open their list. */
export const searchTarget = (h: Pick<SearchHit, 'type' | 'id'>): string => {
  switch (h.type) {
    case 'project': return `/projects/${h.id}`
    case 'location': return '/projects'
    case 'store': return '/stores'
    case 'material': return '/materials'
    case 'vendor': return '/vendors'
    case 'equipment': return '/equipment/register'
  }
}

export const SEARCH_TYPE_LABEL: Record<SearchType, string> = {
  project: 'Project', location: 'Location', store: 'Store', material: 'Material', vendor: 'Vendor', equipment: 'Equipment',
}
