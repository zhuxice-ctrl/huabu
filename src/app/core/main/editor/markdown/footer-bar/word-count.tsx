'use client'

import { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'

interface WordCountProps {
  editor: Editor
}

export function WordCount({ editor }: WordCountProps) {
  const [characters, setCharacters] = useState(() => editor.state.doc.textContent.length)

  useEffect(() => {
    if (!editor) {
      setCharacters(0)
      return
    }

    let updateTimer: ReturnType<typeof setTimeout> | null = null

    const updateCharacters = () => {
      if (updateTimer) {
        clearTimeout(updateTimer)
      }

      updateTimer = setTimeout(() => {
        updateTimer = null
        setCharacters(editor.state.doc.textContent.length)
      }, 400)
    }

    setCharacters(editor.state.doc.textContent.length)
    editor.on('create', updateCharacters)
    editor.on('update', updateCharacters)

    return () => {
      if (updateTimer) {
        clearTimeout(updateTimer)
      }
      editor.off('create', updateCharacters)
      editor.off('update', updateCharacters)
    }
  }, [editor])

  return (
    <span className="text-xs">{characters} 字符</span>
  )
}
