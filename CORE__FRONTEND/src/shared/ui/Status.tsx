import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/** pending = amber · approved = green · rejected = red · review = blue · draft = grey */
export type StatusTone = 'pending' | 'approved' | 'rejected' | 'review' | 'draft'

export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return <span className={cn('status', `s-${tone}`, className)}>{children}</span>
}
  