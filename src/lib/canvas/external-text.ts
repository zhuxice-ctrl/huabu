const LINE_SEPARATOR_RE = /\r\n?|[\u2028\u2029]/g
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g
const EXOTIC_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TR', 'UL',
])

export function normalizeExternalText(value: string): string {
  return value
    .replace(LINE_SEPARATOR_RE, '\n')
    .replace(ZERO_WIDTH_RE, '')
    .replace(EXOTIC_SPACE_RE, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

export function htmlToExternalText(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return ''
  const document = new DOMParser().parseFromString(html, 'text/html')
  const chunks: string[] = []
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      chunks.push(node.textContent ?? '')
      return
    }
    if (!(node instanceof Element)) return
    if (node.tagName === 'BR') {
      chunks.push('\n')
      return
    }
    const block = BLOCK_TAGS.has(node.tagName)
    if (block && chunks.at(-1) !== '\n') chunks.push('\n')
    node.childNodes.forEach(visit)
    if (block && chunks.at(-1) !== '\n') chunks.push('\n')
  }
  document.body.childNodes.forEach(visit)
  return normalizeExternalText(chunks.join(''))
}

export function chooseExternalText(input: {
  plainText: string
  htmlText: string
  htmlToText?: (html: string) => string
}): string {
  const plain = normalizeExternalText(input.plainText)
  if (plain) return plain
  return normalizeExternalText((input.htmlToText ?? htmlToExternalText)(input.htmlText))
}

export function insertExternalText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  inserted: string,
) {
  const start = Math.max(0, Math.min(value.length, selectionStart))
  const end = Math.max(start, Math.min(value.length, selectionEnd))
  const normalized = normalizeExternalText(inserted)
  return {
    value: `${value.slice(0, start)}${normalized}${value.slice(end)}`,
    caret: start + normalized.length,
  }
}
