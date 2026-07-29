export type CanvasImageRecognitionStatus = 'pending' | 'running' | 'recognized' | 'ocr-only' | 'failed'

export interface CanvasImageRecognitionIdentity {
  canvasId: string
  nodeId: string
  contentRevision: string
  imageHash: string
  modelKey: string
}

export function imageRecognitionCacheKey(identity: CanvasImageRecognitionIdentity): string {
  return JSON.stringify([
    identity.canvasId.trim(),
    identity.nodeId.trim(),
    identity.contentRevision.trim(),
    identity.imageHash.trim().toLowerCase(),
    identity.modelKey.trim(),
  ])
}

export function planCanvasImageRecognition(input: {
  enabled: boolean
  sensitive: boolean
  modelConfigured: boolean
  explicitRequest: boolean
  confirmed: boolean
}) {
  const requiresConfirmation = input.enabled && input.sensitive && input.modelConfigured
    && input.explicitRequest && !input.confirmed
  return {
    runOcr: input.enabled,
    runVision: input.enabled && input.modelConfigured && (!input.sensitive || input.confirmed),
    requiresConfirmation,
  }
}

export function recognitionKnowledgeParts(input: { ocrText: string; visionDescription: string }) {
  return [
    { contentType: 'image-ocr' as const, text: input.ocrText.trim().slice(0, 100_000) },
    { contentType: 'image-description' as const, text: input.visionDescription.trim().slice(0, 100_000) },
  ].filter(part => part.text.length > 0)
}
