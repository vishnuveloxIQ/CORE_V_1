import type { ComponentType } from 'react'

export interface AppRoute {
  path: string
  Component: ComponentType
  /** a real URL for routes with params, used by the smoke test */
  sample?: string
}
