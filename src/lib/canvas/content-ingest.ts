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

export type CanvasIngestDraft =
  | { kind: 'text'; text: string; width: number; height: number }
  | { kind: 'link'; url: string; label: string; width: 320; height: 112 }
  | { kind: 'image'; file: File; label: string; width: 320; height: 220 }
  | { kind: 'file'; file: File; label: string; width: 320; height: 112 }

export interface CanvasTransferInput {
  files: File[]
  html: string
  text: string
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}

export function draftsFromTransfer(input: CanvasTransferInput): CanvasIngestDraft[] {
  if (input.files.length > 0) {
    return input.files.map(file => file.type.startsWith('image/')
      ? { kind: 'image', file, label: file.name, width: 320, height: 220 }
      : { kind: 'file', file, label: file.name, width: 320, height: 112 })
  }

  const content = input.html ? htmlToPlainText(input.html) : input.text.trim()
  if (!content) return []
  const classified = classifyTextContent(content)
  if (classified.kind === 'link') {
    return [{ kind: 'link', url: classified.value, label: classified.value, width: 320, height: 112 }]
  }
  const size = estimateTextBlockSize(classified.value)
  return [{ kind: 'text', text: classified.value, ...size }]
}

export function offsetIngestDrafts<T>(drafts: T[], origin: { x: number; y: number }) {
  return drafts.map((draft, index) => ({
    draft,
    position: { x: origin.x + index * 28, y: origin.y + index * 28 },
  }))
}
