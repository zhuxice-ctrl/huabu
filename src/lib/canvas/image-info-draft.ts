import { normalizeImageTags } from './image-tags.ts'

export interface ImageInfoDraftInitialValue {
  name: string
  comment: string
  tags: string[]
}

export function imageInfoDraftInitialization(
  wasOpen: boolean,
  open: boolean,
  initial: ImageInfoDraftInitialValue,
): ImageInfoDraftInitialValue | null {
  if (!open || wasOpen) return null
  return {
    name: initial.name,
    comment: initial.comment,
    tags: normalizeImageTags(initial.tags),
  }
}
