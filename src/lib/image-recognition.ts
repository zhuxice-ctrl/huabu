import { fetchAiDesc, fetchAiDescByImage } from '@/lib/ai/description'
import { getAISettings } from '@/lib/ai/utils'
import ocr from '@/lib/ocr'

export type ImageRecognitionStage = 'vlm' | 'ocr' | 'description'

export interface ImageRecognitionResult {
  content: string
  desc: string
  ocrText: string
  visionDescription: string
  method: 'hybrid' | 'vlm' | 'ocr' | 'none'
}

interface RecognizeImageOptions {
  imagePath?: string | null
  base64?: string | null
  shouldGenerateDescription?: boolean
  onProgress?: (stage: ImageRecognitionStage) => void
}

async function tryRecognizeWithVlm(base64: string): Promise<string | null> {
  const content = await fetchAiDescByImage(base64)
  return content?.trim() ? content : null
}

async function recognizeWithOcr(
  imagePath?: string | null,
  shouldGenerateDescription = false,
  onProgress?: (stage: ImageRecognitionStage) => void
): Promise<ImageRecognitionResult> {
  if (!imagePath) {
    return {
      content: '',
      desc: '',
      ocrText: '',
      visionDescription: '',
      method: 'none',
    }
  }

  onProgress?.('ocr')
  const content = await ocr(imagePath) || ''
  let desc = content

  if (shouldGenerateDescription && content.trim()) {
    onProgress?.('description')
    desc = await fetchAiDesc(content).then((res) => res || content) || content
  }

  return {
    content,
    desc,
    ocrText: content,
    visionDescription: shouldGenerateDescription && desc !== content ? desc : '',
    method: 'ocr',
  }
}

export async function recognizeImageWithFallback({
  imagePath,
  base64,
  shouldGenerateDescription = false,
  onProgress,
}: RecognizeImageOptions): Promise<ImageRecognitionResult> {
  let ocrText = ''
  let visionDescription = ''

  if (imagePath) {
    try {
      const ocrResult = await recognizeWithOcr(imagePath, shouldGenerateDescription, onProgress)
      ocrText = ocrResult.ocrText
      visionDescription = ocrResult.visionDescription
    } catch {
      console.warn('Local OCR image recognition failed')
    }
  }

  try {
    const vlmConfig = base64 ? await getAISettings('imageMethodModel') : undefined
    if (base64 && vlmConfig?.model) {
      onProgress?.('vlm')
      visionDescription = await tryRecognizeWithVlm(base64) || visionDescription
    }
  } catch {
    console.warn('VLM image recognition failed')
  }

  return {
    content: ocrText || visionDescription,
    desc: visionDescription || ocrText,
    ocrText,
    visionDescription,
    method: visionDescription && ocrText ? 'hybrid' : visionDescription ? 'vlm' : ocrText ? 'ocr' : 'none',
  }
}
