import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  draftsFromTransfer,
  getNativeVideoPlaybackUrl,
  transferUrlChoice,
} from '../../src/lib/canvas/content-ingest.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')

test('rich-media transfer classification covers files, direct video URLs and explicit previews', () => {
  const files = [
    new File(['image'], 'photo.png', { type: 'image/png' }),
    new File(['pdf'], 'plan.pdf', { type: 'application/pdf' }),
    new File(['video'], 'walkthrough.mp4', { type: 'video/mp4' }),
    new File(['archive'], 'sources.zip', { type: 'application/zip' }),
  ]
  assert.deepEqual(
    draftsFromTransfer({ files, html: '', text: '' }).map(draft => draft.kind),
    ['image', 'pdf', 'video', 'file'],
  )
  assert.equal(draftsFromTransfer({ files: [], html: '', text: 'plain text' })[0].kind, 'text')
  assert.equal(draftsFromTransfer({ files: [], html: '', text: 'https://example.com/page' })[0].kind, 'link')
  assert.equal(draftsFromTransfer({ files: [], html: '', text: 'https://cdn.example.com/demo.webm?download=1' })[0].kind, 'video')
  assert.equal(draftsFromTransfer({
    files: [],
    html: '',
    text: 'https://example.com/page',
    urlChoice: 'web-preview',
  })[0].kind, 'web-preview')
})

test('URL paste requests a lightweight link-versus-preview or link-versus-video choice', () => {
  assert.deepEqual(
    transferUrlChoice({ files: [], html: '', text: 'https://example.com/page' }),
    { url: 'https://example.com/page', mediaKind: 'web-preview' },
  )
  assert.deepEqual(
    transferUrlChoice({ files: [], html: '', text: 'https://cdn.example.com/demo.mp4' }),
    { url: 'https://cdn.example.com/demo.mp4', mediaKind: 'video' },
  )
  assert.equal(transferUrlChoice({ files: [new File(['x'], 'x.txt')], html: '', text: 'https://example.com' }), null)
})

test('Windows video files fall back to a constrained extension set for blank or generic MIME', () => {
  const files = [
    new File(['video'], 'walkthrough.MP4'),
    new File(['video'], 'screen-recording.webm', { type: 'application/octet-stream' }),
    new File(['video'], 'legacy.avi'),
    new File(['text'], 'misleading.mov', { type: 'text/plain' }),
  ]

  assert.deepEqual(
    draftsFromTransfer({ files, html: '', text: '' }).map(draft => draft.kind),
    ['video', 'video', 'file', 'file'],
  )
})

test('hosted video pages stay non-native while direct media URLs remain playable', () => {
  const hostedPages = [
    'https://www.youtube.com/watch?v=demo',
    'https://vimeo.com/123456789',
    'https://player.vimeo.com/video/123456789.mp4',
    'https://www.bilibili.com/video/BV1demo',
  ]

  for (const url of hostedPages) {
    assert.deepEqual(
      transferUrlChoice({ files: [], html: '', text: url }),
      { url, mediaKind: 'video' },
    )
    assert.equal(draftsFromTransfer({ files: [], html: '', text: url, urlChoice: 'video' })[0].kind, 'video')
    assert.equal(getNativeVideoPlaybackUrl(url), null)
  }

  const directUrl = 'https://cdn.example.com/media/demo.mp4?token=example#playback'
  assert.equal(getNativeVideoPlaybackUrl(directUrl), directUrl)
})

test('archives remain shallow attachments and videos do not promise transcription', () => {
  const archive = draftsFromTransfer({
    files: [new File(['archive'], 'research.tar.gz', { type: 'application/gzip' })],
    html: '',
    text: '',
  })[0]
  assert.equal(archive.kind, 'file')
  assert.deepEqual(Object.keys(archive.metadata).sort(), ['directory', 'fileName', 'kind', 'userNotes'])
  assert.deepEqual(archive.metadata, {
    kind: 'attachment',
    fileName: 'research.tar.gz',
    directory: '画布资源',
    userNotes: '',
  })

  const video = draftsFromTransfer({
    files: [new File(['video'], 'interview.mp4', { type: 'video/mp4' })],
    html: '',
    text: '',
  })[0]
  assert.equal(video.kind, 'video')
  assert.deepEqual(Object.keys(video.metadata).sort(), ['description', 'kind', 'subtitles', 'title', 'userNotes'])
  assert.equal('transcription' in video.metadata, false)
})

test('all rich-media drafts use positive finite screen dimensions', () => {
  const inputs = [
    { files: [new File(['pdf'], 'plan.pdf', { type: 'application/pdf' })], html: '', text: '' },
    { files: [new File(['video'], 'demo.mp4', { type: 'video/mp4' })], html: '', text: '' },
    { files: [], html: '', text: 'https://example.com', urlChoice: 'web-preview' },
  ]
  for (const input of inputs) {
    const { width, height } = draftsFromTransfer(input)[0].screenSize
    assert.ok(Number.isFinite(width) && width > 0)
    assert.ok(Number.isFinite(height) && height > 0)
  }
})

test('runtime preparation isolates each failed item and keeps successful input order', () => {
  const editor = read('src/app/core/main/canvas/canvas-editor.tsx')
  assert.match(editor, /for \(const item of stackIngestDrafts\(materializedDrafts, capturedViewport\)\)/)
  assert.match(editor, /resourcePath[^]*catch[^]*cleanupPersistedResources\(\[resourcePath\]\)/)
  assert.doesNotMatch(editor, /Promise\.all\(stackIngestDrafts/)
})

test('planned renderers lazy-load local media, isolate failures and keep source opening available', () => {
  const pdf = read('src/app/core/main/canvas/nodes/pdf-canvas-node.tsx')
  const video = read('src/app/core/main/canvas/nodes/video-canvas-node.tsx')
  const preview = read('src/app/core/main/canvas/nodes/web-preview-canvas-node.tsx')
  const editor = read('src/app/core/main/canvas/canvas-editor.tsx')

  assert.match(pdf, /loading="lazy"/)
  assert.match(pdf, /onError=/)
  assert.match(pdf, /openPath/)
  assert.match(video, /IntersectionObserver/)
  assert.match(video, /getNativeVideoPlaybackUrl\(remoteUrl\)/)
  assert.match(video, /preload="metadata"/)
  assert.match(video, /onError=/)
  assert.match(video, /open(?:Path|Url)/)
  assert.match(preview, /untrusted-display-only/)
  assert.doesNotMatch(preview, /operation gateway|applyCanvasOperations|emitter\.emit\('canvas-agent/)
  for (const source of [pdf, video, preview]) {
    assert.match(source, /#66D9FF/)
    assert.match(source, /#FF5D5D/)
    assert.match(source, /#F2B84B/)
  }
  assert.match(editor, /'web-preview': WebPreviewCanvasNode/)
  assert.match(editor, /pdf: PdfCanvasNode/)
  assert.match(editor, /video: VideoCanvasNode/)
})
