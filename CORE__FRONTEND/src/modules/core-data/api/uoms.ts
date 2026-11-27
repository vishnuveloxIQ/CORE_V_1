import { api, ApiError } from '@/shared/lib/api'

/**
 * Units of measure (GET /uoms, any signed-in user, sorted by name). POST /uoms adds a unit typed for a material (masters.manage);
 * a unit that is not on this list cannot be picked. A material or plan line holds the code as its unit text and sends uomId.
 */
export interface UomRecord {
  id: string
  code: string
  name: string
  rowVersion: number
  createdAt: string
  updatedAt: string
}

export const listUoms = () => api<UomRecord[]>('GET', '/uoms')

/** The unit text shown for a uom id (its code), or '' when the id is not on the list. */
export const uomCodeOf = (uoms: UomRecord[], id: string | null | undefined) => (id ? uoms.find((u) => u.id === id)?.code ?? '' : '')

/** The uom id for a unit written as text (its code or name, ignoring case), or undefined when the server has no such unit. */
export const uomIdOf = (uoms: UomRecord[], text: string | null | undefined) => {
  const t = text?.trim().toLowerCase()
  if (!t) return undefined
  return (uoms.find((u) => u.code.toLowerCase() === t) ?? uoms.find((u) => u.name.toLowerCase() === t))?.id
}

/** Like uomIdOf, but a unit that is not on the server's list is refused with a clear message. */
export const requireUomId = (uoms: UomRecord[], text: string) => {
  const id = uomIdOf(uoms, text)
  if (!id) throw new ApiError(400, 'UOM_NOT_ON_SERVER', `"${text}" is not one of the server's units of measure. Pick a unit from the list.`)
  return id
}

/** The option label for a unit: the name, with the code when it differs. */
export const uomLabel = (u: UomRecord) => (u.code.toLowerCase() === u.name.toLowerCase() ? u.name : `${u.name} (${u.code})`)

/** POST /uoms: adds a unit typed for a material. Throws ApiError (CONFLICT when the code exists). */
export const createUom = (code: string, name: string, idempotencyKey?: string) =>
  api<UomRecord>('POST', '/uoms', { body: { code, name }, idempotencyKey })
