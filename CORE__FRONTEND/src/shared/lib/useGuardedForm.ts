import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useUnsavedGuard } from '@/shared/lib/unsaved'

/**
 * `useForm` that reports its unsaved changes to the page guard (see shared/lib/unsaved). While a submit runs the form
 * is not counted as unsaved, and after a successful submit it is reset to what was saved, so no leave prompt follows a
 * save. The signature is the same as react-hook-form's, so a form only changes its import.
 */
export const useGuardedForm = ((props?: Parameters<typeof useForm>[0]) => {
  const form = useForm(props)
  const { isDirty, isSubmitSuccessful } = form.formState
  const markSaving = useUnsavedGuard(isDirty)
  const { reset, getValues } = form

  useEffect(() => {
    if (isSubmitSuccessful) reset(getValues())
  }, [isSubmitSuccessful, reset, getValues])

  // mark the form as saving before the handler runs, so a save that navigates away is not held
  const handleSubmit = form.handleSubmit
  form.handleSubmit = ((onValid: Parameters<typeof handleSubmit>[0], onInvalid?: Parameters<typeof handleSubmit>[1]) =>
    handleSubmit(async (values, event) => {
      markSaving(true)
      try {
        await onValid(values, event)
      } finally {
        markSaving(false)
      }
    }, onInvalid)) as typeof handleSubmit

  return form
}) as typeof useForm
