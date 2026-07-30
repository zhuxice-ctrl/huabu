import type { CanvasNode } from '../../types/canvas'

const MAX_TAG_LENGTH = 40

export function normalizeImageTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const tag = value.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

export function mergeImageTagCatalog(catalog: string[], nodeTagLists: unknown[]) {
  return normalizeImageTags([...catalog, ...nodeTagLists.flatMap(value => normalizeImageTags(value))])
}

export function imageMatchesTags(
  node: Pick<CanvasNode, 'type' | 'data'>,
  selected: string[],
) {
  if (node.type !== 'image') return false
  const wanted = new Set(normalizeImageTags(selected).map(tag => tag.toLocaleLowerCase()))
  return wanted.size > 0 && normalizeImageTags(node.data.imageTags)
    .some(tag => wanted.has(tag.toLocaleLowerCase()))
}

export function orderedMatchingImageIds(nodes: CanvasNode[], selected: string[]) {
  return nodes.filter(node => imageMatchesTags(node, selected))
    .sort((left, right) => left.position.y - right.position.y
      || left.position.x - right.position.x
      || left.id.localeCompare(right.id))
    .map(node => node.id)
}
