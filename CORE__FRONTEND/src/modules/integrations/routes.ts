import { createElement } from 'react'
import { Navigate } from 'react-router-dom'
import type { AppRoute } from '@/shared/types/route'

// The module messages and module data screens now live as tabs of the Activity log; the old addresses open those tabs.
export const integrationRoutes: AppRoute[] = [
  { path: '/integrations/events', Component: () => createElement(Navigate, { to: '/audit?view=messages', replace: true }) },
  { path: '/integrations/read-models', Component: () => createElement(Navigate, { to: '/audit?view=data', replace: true }) },
]
