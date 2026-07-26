import type { CanvasNode, CanvasNodeType, CanvasSize } from '../../types/canvas'
import {
  canvasSizeToScreen,
  contentScaleForZoom,
  screenDistanceToCanvas,
  screenSizeToCanvas,
  type ViewportSnapshot,
} from './viewport-sizing.ts'

const DEFAULT_SCREEN_FONT_SIZE = 15
const MIN_CONTENT_SCALE = 0.1667
const MAX_CONTENT_SCALE = 10

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
  | { kind: 'text'; text: string; screenSize: CanvasSize }
  | { kind: 'link'; url: string; label: string; screenSize: CanvasSize }
  | { kind: 'image'; file: File; label: string; screenSize: CanvasSize }
  | { kind: 'file'; file: File; label: string; screenSize: CanvasSize }
  | { kind: 'pdf'; file: File; label: string; screenSize: CanvasSize }
  | { kind: 'video'; file?: File; url?: string; label: string; screenSize: CanvasSize }

export type MaterializedCanvasDraft = CanvasIngestDraft & {
  canvasSize: CanvasSize
  fontSize: number
  contentScale: number
}

export function materializeIngestDraft(
  draft: CanvasIngestDraft,
  snapshot: ViewportSnapshot,
): MaterializedCanvasDraft {
  return {
    ...draft,
    canvasSize: screenSizeToCanvas(draft.screenSize, snapshot),
    fontSize: screenDistanceToCanvas(DEFAULT_SCREEN_FONT_SIZE, snapshot),
    contentScale: contentScaleForZoom(snapshot.zoom),
  }
}

export function screenFontSizeForCanvasFont(
  canvasFontSize: number,
  snapshot: ViewportSnapshot,
): number {
  return canvasSizeToScreen({ width: canvasFontSize, height: 0 }, snapshot).width
}

export function canvasFontSizeForScreenInput(
  screenFontSize: number,
  snapshot: ViewportSnapshot,
): number | null {
  if (!Number.isFinite(screenFontSize) || screenFontSize < 8 || screenFontSize > 96) return null
  return screenDistanceToCanvas(screenFontSize, snapshot)
}

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
    return input.files.map(file => {
      if (file.type.startsWith('image/')) {
        return { kind: 'image' as const, file, label: file.name, screenSize: { width: 320, height: 220 } }
      }
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        return { kind: 'pdf' as const, file, label: file.name, screenSize: { width: 320, height: 220 } }
      }
      if (file.type.startsWith('video/')) {
        return { kind: 'video' as const, file, label: file.name, screenSize: { width: 360, height: 220 } }
      }
      return { kind: 'file' as const, file, label: file.name, screenSize: { width: 320, height: 112 } }
    })
  }

  const content = input.html ? htmlToPlainText(input.html) : input.text.trim()
  if (!content) return []
  const classified = classifyTextContent(content)
  if (classified.kind === 'link') {
    return [{ kind: 'link', url: classified.value, label: classified.value, screenSize: { width: 320, height: 112 } }]
  }
  const size = estimateTextBlockSize(classified.value)
  return [{ kind: 'text', text: classified.value, screenSize: size }]
}

export function offsetIngestDrafts<T>(drafts: T[], origin: { x: number; y: number }) {
  return drafts.map((draft, index) => ({
    draft,
    position: { x: origin.x + index * 28, y: origin.y + index * 28 },
  }))
}

const AI_FALLBACK_SIZE: Record<CanvasNodeType, CanvasSize> = {
  process: { width: 220, height: 96 },
  decision: { width: 220, height: 140 },
  terminator: { width: 220, height: 88 },
  text: { width: 320, height: 160 },
  image: { width: 320, height: 220 },
  note: { width: 320, height: 180 },
  link: { width: 320, height: 112 },
  file: { width: 320, height: 112 },
  todo: { width: 280, height: 112 },
  group: { width: 480, height: 320 },
  freehand: { width: 160, height: 120 },
}

interface AiNodeSizingInput {
  requestedType: CanvasNodeType
  requestedSize?: CanvasSize
  targetNode?: CanvasNode
  nearbySameType: CanvasNode[]
  referencePoint?: { x: number; y: number }
}

function isValidDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function round4(value: number): number {
  const result = Math.round((value + Number.EPSILON) * 10_000) / 10_000
  return Object.is(result, -0) ? 0 : result
}

export function normalizeContentScaleForRead(value: unknown): number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= MIN_CONTENT_SCALE
    && value <= MAX_CONTENT_SCALE
    ? value
    : 1
}

function sizingCandidates(input: AiNodeSizingInput): CanvasNode[] {
  const matchingTarget = input.targetNode?.type === input.requestedType ? input.targetNode : undefined
  const origin = matchingTarget
    ? {
        x: matchingTarget.position.x + (isValidDimension(matchingTarget.width) ? matchingTarget.width / 2 : 0),
        y: matchingTarget.position.y + (isValidDimension(matchingTarget.height) ? matchingTarget.height / 2 : 0),
      }
    : input.referencePoint ?? { x: 0, y: 0 }
  return input.nearbySameType
    .filter(node => node.type === input.requestedType)
    .map(node => {
      const center = {
        x: node.position.x + (isValidDimension(node.width) ? node.width / 2 : 0),
        y: node.position.y + (isValidDimension(node.height) ? node.height / 2 : 0),
      }
      return { node, distance: Math.hypot(center.x - origin.x, center.y - origin.y) }
    })
    .filter(candidate => candidate.distance <= 1200)
    .sort((left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id))
    .slice(0, 3)
    .map(candidate => candidate.node)
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function resolveAiNodeSize(input: AiNodeSizingInput): CanvasSize {
  const matchingTarget = input.targetNode?.type === input.requestedType ? input.targetNode : undefined
  const candidates = sizingCandidates(input)
  const resolveField = (field: 'width' | 'height'): number => {
    const requested = input.requestedSize?.[field]
    if (isValidDimension(requested)) return round4(requested)
    const targetValue = matchingTarget?.[field]
    if (isValidDimension(targetValue)) return round4(targetValue)
    const candidateValues = candidates
      .map(node => node[field])
      .filter(isValidDimension)
    return candidateValues.length > 0
      ? round4(median(candidateValues))
      : AI_FALLBACK_SIZE[input.requestedType][field]
  }
  return { width: resolveField('width'), height: resolveField('height') }
}

export function resolveAiNodeContentScale(input: AiNodeSizingInput): number {
  const matchingTarget = input.targetNode?.type === input.requestedType ? input.targetNode : undefined
  if (matchingTarget) return normalizeContentScaleForRead(matchingTarget.data.contentScale)
  const candidates = sizingCandidates(input)
  return candidates.length > 0
    ? round4(median(candidates.map(node => normalizeContentScaleForRead(node.data.contentScale))))
    : 1
}

export function resolveAiNodeFontSize(input: AiNodeSizingInput): number {
  const matchingTarget = input.targetNode?.type === input.requestedType ? input.targetNode : undefined
  if (isValidDimension(matchingTarget?.data.fontSize)) return round4(matchingTarget.data.fontSize)
  const candidateValues = sizingCandidates(input)
    .map(node => node.data.fontSize)
    .filter(isValidDimension)
  return candidateValues.length > 0 ? round4(median(candidateValues)) : DEFAULT_SCREEN_FONT_SIZE
}
