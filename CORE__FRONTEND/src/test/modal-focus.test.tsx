import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Modal } from '@/shared/ui/Modal'

// CORE-17-04 (keyboard audit): closing a dialog returns focus to the control that opened it, also when the dialog is
// removed from the page as it closes, which is how most dialogs here are written.

function Removed() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      {open && <Modal open onOpenChange={(o) => !o && setOpen(false)} title="Removed on close"><button type="button">Inside</button></Modal>}
    </>
  )
}

function Kept() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open kept dialog</button>
      <Modal open={open} onOpenChange={setOpen} title="Kept on close"><button type="button">Inside</button></Modal>
    </>
  )
}

describe('dialog focus', () => {
  it.each([
    ['removed from the page', Removed, 'Open dialog'],
    ['kept on the page', Kept, 'Open kept dialog'],
  ])('a dialog %s returns focus to its opener on Escape', async (_name, Component, label) => {
    render(<Component />)
    const opener = screen.getByRole('button', { name: label })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})
