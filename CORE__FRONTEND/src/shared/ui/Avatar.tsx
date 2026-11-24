import { avatarTone, initials } from '@/shared/lib/format'
import { cn } from '@/shared/lib/cn'

const TONES = ['', 'b', 'g', 'a'] as const

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={cn('av', TONES[avatarTone(name)], className)} aria-hidden>{initials(name)}</span>
}

export function Who({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="who">
      <Avatar name={name} />
      <div>
        <strong>{name}</strong>
        {sub && <span className="sub">{sub}</span>}
      </div>
    </div>
  )
}
