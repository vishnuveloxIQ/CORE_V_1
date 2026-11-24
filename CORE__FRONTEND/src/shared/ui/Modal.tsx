import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Icon } from '@/shared/ui/icons'
import { hasUnsaved, useUnsaved } from '@/shared/lib/unsaved'

interface ModalProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** 'full' fills most of the viewport (for previews); 'wide' is a larger dialog for dense detail views. */
  size?: 'full' | 'wide'
  /** false for a dialog that must not ask about unsaved changes (the leave prompt itself) */
  guard?: boolean
}

const SIZE_CLASS = { full: 'modal modal-full', wide: 'modal modal-wide' } as const

/** Moves focus back to the control that opened the dialog, if it is still on the page. */
function restore(el: HTMLElement | null) {
  if (el?.isConnected) el.focus({ preventScroll: true })
}

export function Modal({ open, onOpenChange, title, description, children, size, guard = true }: ModalProps) {
  const confirmLeave = useUnsaved((s) => s.confirmLeave)
  // closing with the X, Escape or a click outside asks first when the form inside has unsaved changes
  const requestChange = (o: boolean) => {
    if (o || !guard || !hasUnsaved()) return onOpenChange(o)
    void confirmLeave().then((leave) => { if (leave) onOpenChange(false) })
  }
  // The control that had focus when the dialog opened. Radix returns focus there on close, but many dialogs are
  // removed from the page as they close (their parent stops rendering them), which loses that step. Keeping the
  // element here returns keyboard and screen-reader users to where they were, both on close and on removal.
  const opener = useRef<HTMLElement | null>(null)
  const isOpen = useRef(false)
  // a layout effect runs before Radix moves focus into the dialog, so the opener still has focus here
  useLayoutEffect(() => {
    if (open && !isOpen.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    isOpen.current = open
  }, [open])
  useEffect(() => () => {
    if (!isOpen.current) return
    const el = opener.current
    setTimeout(() => restore(el), 0)
  }, [])

  return (
    <Dialog.Root open={open} onOpenChange={requestChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop open">
          <Dialog.Content
            className={size ? SIZE_CLASS[size] : 'modal'}
            onCloseAutoFocus={(e) => {
              if (!opener.current?.isConnected) return
              e.preventDefault()
              restore(opener.current)
            }}
          >
            <div className="modal-head">
              <Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
              <Dialog.Close className="close" aria-label="Close dialog"><Icon name="close" /></Dialog.Close>
            </div>
            {description ? <Dialog.Description className="sr-only">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            <div className="modal-body">{children}</div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
