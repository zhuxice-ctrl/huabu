export interface SensitiveEndpointConfig {
  baseUrl: string | undefined | null
  proxyMode?: string | null
  proxyURL?: string | null
  globalProxyURL?: string | null
  redirectUrl?: string | null
}

export interface SensitiveEvidenceAnchor {
  id: string
  nodeId: string
  plainText: string
  userMarkedSensitive?: boolean
}

function isLoopbackUrl(value: string | undefined | null): boolean {
  if (!value?.trim()) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'localhost'
      || host === '::1'
      || host === '[::1]'
      || /^127(?:\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

export function isRawSensitiveContextAllowed(config: SensitiveEndpointConfig): boolean {
  // Unknown proxy state must be treated as cloud-bound; only an explicit disabled mode is direct.
  if (config.proxyMode !== 'disabled' && config.proxyMode !== 'direct') return false
  if (config.proxyURL?.trim() || config.globalProxyURL?.trim()) return false
  return isLoopbackUrl(config.baseUrl) && (!config.redirectUrl || isLoopbackUrl(config.redirectUrl))
}

function stableMarker(kind: string, anchorId: string, value: string) {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(`${anchorId}:${kind}:${value}`)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `[[REDACTED:${kind}:${(hash >>> 0).toString(16).padStart(8, '0')}]]`
}

const SENSITIVE_PATTERNS: Array<[string, RegExp]> = [
  ['API_KEY', /\b(?:sk|rk|pk|AKIA)[-_A-Za-z0-9]{12,}\b/g],
  ['API_KEY', /\b(?:api[_ -]?key|access[_ -]?token|token)\s*[:=]\s*[^\s,;]+/gi],
  ['PASSWORD', /\b(?:password|passwd|pwd)\s*[:=]\s*[^\s,;]+/gi],
  ['IDENTITY_NUMBER', /\b\d{17}[\dXx]\b/g],
]

export function redactSensitiveText(text: string, anchorId: string): string {
  return SENSITIVE_PATTERNS.reduce((redacted, [kind, pattern]) => (
    redacted.replace(pattern, match => stableMarker(kind, anchorId, match))
  ), text)
}

export function prepareCanvasEvidenceForRequest<T extends SensitiveEvidenceAnchor>(
  anchors: T[],
  endpoint: SensitiveEndpointConfig,
): { rawSensitiveAllowed: boolean; anchors: T[] } {
  const rawSensitiveAllowed = isRawSensitiveContextAllowed(endpoint)
  if (rawSensitiveAllowed) return { rawSensitiveAllowed, anchors }
  return {
    rawSensitiveAllowed,
    anchors: anchors.map(anchor => ({
      ...anchor,
      plainText: anchor.userMarkedSensitive
        ? stableMarker('USER_MARKED_SENSITIVE', anchor.id, anchor.nodeId)
        : redactSensitiveText(anchor.plainText, anchor.id),
    })),
  }
}
