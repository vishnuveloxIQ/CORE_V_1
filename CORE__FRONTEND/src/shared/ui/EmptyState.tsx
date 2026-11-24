import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/shared/ui/icons'

export function EmptyState({ icon = 'inbox', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="ring2"><Icon name={icon} /></div>
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  )
}
