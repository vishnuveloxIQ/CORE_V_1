import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'
import { Icon, type IconName } from '@/shared/ui/icons'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = main action (one per screen), secondary = default, success/danger = decisions, white = on dark surfaces */
  tone?: 'primary' | 'secondary' | 'success' | 'danger' | 'white'
  size?: 'md' | 'sm'
  icon?: IconName
  iconRight?: IconName
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = 'secondary', size = 'md', icon, iconRight, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn('btn', tone, size === 'sm' && 'sm', className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  )
})
