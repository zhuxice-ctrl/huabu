export function classifyTextContent(text: string) {
  const value = text.trim()
  return /^https?:\/\/\S+$/i.test(value)
    ? { kind: 'link' as const, value }
    : { kind: 'text' as const, value }
}

export function estimateTextBlockSize(text: string) {
  const longestLine = Math.max(
    1,
    ...text.split(/\r?\n/).map(line => Array.from(line).length),
  )
  const width = Math.max(240, Math.min(520, 72 + longestLine * 9))
  const charactersPerLine = Math.max(1, Math.floor((width - 32) / 9))
  const estimatedLines = text.split(/\r?\n/).reduce(
    (total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / charactersPerLine)),
    0,
  )

  return { width, height: Math.max(72, 36 + estimatedLines * 22) }
}
