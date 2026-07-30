'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { normalizeImageTags } from '@/lib/canvas/image-tags'

interface CanvasImageInfoProps {
  open: boolean
  initial: { name: string; comment: string; tags: string[] }
  catalog: string[]
  recent: string[]
  onOpenChange: (open: boolean) => void
  onSave: (value: { name: string; comment: string; tags: string[] }) => void
}

export function CanvasImageInfo({
  open,
  initial,
  catalog,
  recent,
  onOpenChange,
  onSave,
}: CanvasImageInfoProps) {
  const [name, setName] = useState(initial.name)
  const [comment, setComment] = useState(initial.comment)
  const [tags, setTags] = useState(() => normalizeImageTags(initial.tags))
  const [tagQuery, setTagQuery] = useState('')
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setName(initial.name)
      setComment(initial.comment)
      setTags(normalizeImageTags(initial.tags))
      setTagQuery('')
    }
    wasOpenRef.current = open
  }, [initial.comment, initial.name, initial.tags, open])

  const matchingTags = useMemo(() => {
    const query = tagQuery.trim().toLocaleLowerCase()
    const selected = new Set(tags.map(tag => tag.toLocaleLowerCase()))
    return normalizeImageTags(catalog).filter(tag => (
      !selected.has(tag.toLocaleLowerCase()) && (!query || tag.toLocaleLowerCase().includes(query))
    ))
  }, [catalog, tagQuery, tags])

  const addTag = (value: string) => {
    const next = normalizeImageTags([...tags, value])
    if (next.length === tags.length) return
    setTags(next)
    setTagQuery('')
  }

  const removeTag = (value: string) => {
    setTags(current => current.filter(tag => tag.toLocaleLowerCase() !== value.toLocaleLowerCase()))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>图片信息</DialogTitle>
          <DialogDescription>为图片添加名称、评论和标签。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">名称</span>
            <Input value={name} onChange={event => setName(event.target.value)} placeholder="图片名称" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">评论</span>
            <Textarea value={comment} onChange={event => setComment(event.target.value)} placeholder="添加图片评论" />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">标签</span>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button type="button" className="-mr-0.5 text-muted-foreground hover:text-foreground" onClick={() => removeTag(tag)} aria-label={`移除 ${tag}`}>×</button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              value={tagQuery}
              onChange={event => setTagQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                addTag(tagQuery)
              }}
              placeholder="搜索或输入标签后按 Enter 创建"
            />
            {matchingTags.length > 0 && (
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {matchingTags.map(tag => (
                  <Button key={tag} type="button" variant="outline" size="xs" onClick={() => addTag(tag)}>{tag}</Button>
                ))}
              </div>
            )}
            {recent.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">最近使用</span>
                <div className="flex flex-wrap gap-1.5">
                  {normalizeImageTags(recent).map(tag => (
                    <Button key={tag} type="button" variant="secondary" size="xs" onClick={() => addTag(tag)}>{tag}</Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" onClick={() => onSave({ name: name.trim(), comment: comment.trim(), tags })}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
