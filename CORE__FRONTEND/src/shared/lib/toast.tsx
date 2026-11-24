import { toast } from 'sonner'
import { Icon } from '@/shared/ui/icons'

/** Shows a short message. The same text shown again replaces the first toast instead of stacking a copy. */
export const notify = (message: string, duration = 2800) =>
  toast.custom(
    () => (
      <div className="snack" role="status">
        <Icon name="check" />
        <span>{message}</span>
      </div>
    ),
    { duration, id: message },
  )
