import { lazy, type ComponentType } from 'react'

export const page = (load: () => Promise<{ default: ComponentType }>) => lazy(load)
