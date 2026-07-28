'use client'

import type { Editor } from '@tiptap/react'

interface ExportButtonProps {
  editor: Editor
}

export function ExportButton({ editor }: ExportButtonProps) {
  void editor
  return null
}

export default ExportButton
