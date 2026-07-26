'use client'

import { ViewportPortal } from '@xyflow/react'

export interface CanvasSnapGuideOverlay {
  axis: 'x' | 'y'
  position: number
}

const SCREEN_PIXEL = 'calc(1px * var(--canvas-visual-scale,1))'
const GUIDE_SPAN = 200000

/**
 * Geometry guides live in the React Flow viewport rather than node data, so
 * pan/zoom keeps them aligned without ever making them serializable.
 */
export function CanvasGeometryOverlays({ guides }: { guides: CanvasSnapGuideOverlay[] }) {
  if (guides.length === 0) return null

  return (
    <ViewportPortal>
      {guides.map(guide => (
        <div
          key={`${guide.axis}:${guide.position}`}
          aria-hidden="true"
          className="pointer-events-none absolute z-20 bg-[#66D9FF]"
          style={guide.axis === 'x'
            ? {
                left: guide.position,
                top: -GUIDE_SPAN / 2,
                width: SCREEN_PIXEL,
                height: GUIDE_SPAN,
                opacity: 0.7,
              }
            : {
                left: -GUIDE_SPAN / 2,
                top: guide.position,
                width: GUIDE_SPAN,
                height: SCREEN_PIXEL,
                opacity: 0.7,
              }}
        />
      ))}
    </ViewportPortal>
  )
}
