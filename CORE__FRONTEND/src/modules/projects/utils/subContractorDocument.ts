import { errorText } from '@/shared/lib/api'
import { notify } from '@/shared/lib/toast'
import { fetchFileContent } from '@/modules/core-data'

/** Opens an agreement or work order document in a new tab. */
export async function openSubContractorDocument(fileId: string) {
  try {
    const blob = await fetchFileContent(fileId)
    window.open(URL.createObjectURL(blob), '_blank', 'noopener')
  } catch (err) {
    notify(`The document could not be opened: ${errorText(err)}`, 6000)
  }
}
