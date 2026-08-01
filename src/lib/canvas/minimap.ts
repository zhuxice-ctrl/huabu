const TAG_PALETTE = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#f97316']
const TYPE_FALLBACK_COLORS: Record<string, string> = {
  group: '#94a3b8',
  image: '#c084fc',
  text: '#64748b',
}

export function normalizeCanvasTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const tag = value.trim().replace(/\s+/g, ' ').slice(0, 40)
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

export function canvasTagColor(tag: string): string {
  const normalized = normalizeCanvasTags([tag])[0]
  if (!normalized) return TAG_PALETTE[0]
  let hash = 0
  for (const character of normalized.toLocaleLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

export function minimapNodeColor(node: { type?: string; data: Record<string, unknown> }): string {
  const tags = normalizeCanvasTags(node.data.tags ?? node.data.imageTags)
  if (tags.length > 0) return canvasTagColor(tags[0])
  if (typeof node.data.color === 'string' && node.data.color.trim()) return node.data.color
  return TYPE_FALLBACK_COLORS[node.type ?? ''] ?? '#64748b'
}
