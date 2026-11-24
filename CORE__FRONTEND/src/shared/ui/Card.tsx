import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { headingCase } from '@/shared/lib/format'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  style?: CSSProperties
  noBody?: boolean
  enter?: boolean
}

export function Card({ title, subtitle, action, children, className, bodyClassName, style, noBody, enter = true }: CardProps) {
  return (
    <section className={cn('card', className)} style={style} {...(enter ? { 'data-enter': '' } : {})}>
      {(title || action) && (
        <div className="card-h">
          <div>
            {title && <h2 className="card-t">{headingCase(title)}</h2>}
            {subtitle && <div className="card-s">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {noBody ? children : <div className={cn('card-b', bodyClassName)}>{children}</div>}
    </section>
  )
}
