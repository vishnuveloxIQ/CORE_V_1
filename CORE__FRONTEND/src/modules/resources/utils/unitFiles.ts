import { notify } from '@/shared/lib/toast'
import { uploadProblem, type UnitDocKey, type UnitUpload } from '@/modules/core-data'

/** accept lists for the file inputs; the server takes PNG, JPEG, WebP, PDF and Word up to 2 MB */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
export const DOC_ACCEPT = `${IMAGE_ACCEPT},application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx`
export const FILE_HINT = 'PNG, JPEG, WebP, PDF or Word, up to 2 MB.'
export const PHOTO_HINT = 'PNG, JPEG or WebP, up to 2 MB.'
export const isPhotoKey = (k: UnitDocKey) => k.endsWith('Photo')

/** A chosen file as an upload, or the reason it cannot be uploaded (type or 2 MB limit). */
export const asUpload = (file: File): { upload: UnitUpload } | { problem: string } => {
  const problem = uploadProblem(file.name, file.type, file.size)
  return problem ? { problem } : { upload: { blob: file, name: file.name } }
}

/** A notice after a save whose files did not all upload: the unit is saved, the named files are not. */
export const reportFileFailures = (failed: string[]) => {
  if (failed.length) notify(`The unit is saved, but ${failed.length === 1 ? 'one file was' : `${failed.length} files were`} not stored. ${failed.join(' ')} Upload ${failed.length === 1 ? 'it' : 'them'} again from Edit.`, 12000)
}
